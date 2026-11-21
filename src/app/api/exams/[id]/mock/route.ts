import { requireUser, isUser, ok, fail, handle, parseBody } from '@/lib/api';
import { getDb } from '@/lib/db';
import { id } from '@/lib/auth';
import { generateQuizQuestions } from '@/lib/ai/tasks';
import { isAiConfigured } from '@/lib/ai/client';
import { awardXp } from '@/lib/gamification';
import { z } from 'zod';

export const maxDuration = 300;

const schema = z.object({
  count: z.number().int().min(5).max(40).default(20),
  timeLimitMin: z.number().int().min(5).max(300).default(90)
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id: examId } = await ctx.params;
    const body = schema.parse(await req.json().catch(() => ({})));
    const db = getDb();

    if (!isAiConfigured()) {
      return ok({ error: 'AI is niet geconfigureerd. Voeg MISTRAL_API_KEY toe (zie README).', configured: false }, 503);
    }

    const exam = db.prepare('SELECT e.*, s.name subjectName FROM exams e LEFT JOIN subjects s ON s.id = e.subject_id WHERE e.id = ? AND e.user_id = ?').get(examId, u.id) as
      | { id: string; subject_id: string | null; title: string; exam_level: string | null; subjectName: string | null } | undefined;
    if (!exam) return fail('Examen niet gevonden', 404);
    if (!exam.subject_id) return fail('Dit examen is niet aan een vak gekoppeld. Koppel eerst een vak.', 400);

    const chapterIds = (db.prepare('SELECT id, title, summary FROM chapters WHERE subject_id = ? AND user_id = ? ORDER BY position').all(exam.subject_id, u.id)) as { id: string; title: string; summary: string | null }[];
    if (!chapterIds.length) return fail('Dit vak heeft nog geen hoofdstukken met leerstof.', 400);
    const objectives = chapterIds.flatMap((c) => db.prepare('SELECT id, title FROM objectives WHERE chapter_id = ? AND user_id = ? ORDER BY position').all(c.id, u.id) as { id: string; title: string }[]);

    const sourceText = chapterIds.map((c) => {
      const docs = db.prepare('SELECT text FROM documents WHERE chapter_id = ? OR (subject_id = ? AND chapter_id IS NULL)').all(c.id, exam.subject_id) as { text: string }[];
      return `[${c.title}]\n${docs.map((doc) => doc.text).join('\n\n') || c.summary || ''}`;
    }).join('\n\n');
    if (!sourceText.trim()) return fail('Er is nog geen leerstof beschikbaar voor dit vak.', 400);

    const settings = JSON.parse((db.prepare('SELECT settings FROM users WHERE id = ?').get(u.id) as { settings: string }).settings);

    const generated = await generateQuizQuestions(u.id, {
      subjectName: exam.subjectName ?? exam.title,
      chapters: chapterIds.map((c) => ({ id: c.id, title: c.title })),
      objectives,
      sourceText,
      count: body.count,
      types: ['mc_single', 'mc_multi', 'open', 'fill', 'true_false', 'numeric', 'match', 'case', 'numeric', 'chart', 'application', 'steps'],
      difficulty: 'exam',
      language: settings.language || 'nl'
    }, settings.aiModel);
    if (!generated.length) return fail('De AI kon geen proefexamen genereren. Probeer opnieuw.', 502);

    const quizId = id('q_');
    db.prepare('INSERT INTO quizzes (id, user_id, subject_id, title, origin, settings, objective_ids, source_note) VALUES (?,?,?,?,?,?,?,?)').run(
      quizId, u.id, exam.subject_id, `Proefexamen: ${exam.title}`, 'exam_mock',
      JSON.stringify({ mode: 'exam', timeLimitMin: body.timeLimitMin, examId }), '[]', examId
    );
    const ins = db.prepare(
      `INSERT INTO questions (id, quiz_id, user_id, subject_id, type, prompt, context, options, answer, hint, explanation, points, difficulty, objective_ids, source_ref, position)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    generated.forEach((q, i) => {
      ins.run(id('qst_'), quizId, u.id, exam.subject_id, q.type, q.prompt, q.context ?? null,
        JSON.stringify(q.options ?? []), JSON.stringify(q.answer), q.hint ?? null, q.explanation,
        q.points ?? 3, q.difficulty, JSON.stringify(q.objectiveIds ?? []), JSON.stringify(q.sourceRef ?? null), i);
    });
    awardXp(u.id, 'exam_mock');
    return ok({ quizId, count: generated.length, timeLimitMin: body.timeLimitMin }, 201);
  });
}
