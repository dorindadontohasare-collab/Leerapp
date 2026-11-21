import { z } from 'zod';
import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { id } from '@/lib/auth';
import { generateQuizQuestions } from '@/lib/ai/tasks';
import { isAiConfigured } from '@/lib/ai/client';

export const maxDuration = 300;

const schema = z.object({
  title: z.string().min(1).max(200),
  subjectId: z.string().min(1),
  chapterIds: z.array(z.string()).default([]),
  objectiveIds: z.array(z.string()).default([]),
  count: z.number().int().min(1).max(50).default(10),
  types: z.array(z.enum(['mc_single','mc_multi','open','fill','true_false','match','sort','drag','numeric','chart','case','application','concept','compare','steps'])).min(1).default(['mc_single']),
  difficulty: z.enum(['easy', 'medium', 'hard', 'exam']).default('medium'),
  save: z.boolean().default(true),
  mode: z.enum(['normal', 'weak', 'mastery', 'exam_mock']).default('normal'),
  examId: z.string().nullable().optional()
});

export async function POST(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const body = schema.parse(await req.json());
    const db = getDb();

    if (!isAiConfigured()) {
      return ok({ error: 'AI is niet geconfigureerd. Voeg MISTRAL_API_KEY toe aan de omgevingsvariabelen (zie README).', configured: false }, 503);
    }

    const subject = db.prepare('SELECT id, name FROM subjects WHERE id = ? AND user_id = ?').get(body.subjectId, u.id) as
      | { id: string; name: string } | undefined;
    if (!subject) return ok({ error: 'Vak niet gevonden' }, 404);

    let chapterIds = body.chapterIds;
    let objectiveIds = body.objectiveIds;

    if (body.mode === 'weak' && objectiveIds.length === 0) {
      const weak = db.prepare(
        `SELECT id FROM objectives WHERE user_id = ? AND subject_id = ? AND status IN ('new','weak','in_progress') ORDER BY mastery_score ASC LIMIT 20`
      ).all(u.id, body.subjectId) as { id: string }[];
      objectiveIds = weak.map((w) => w.id);
      if (!objectiveIds.length) return ok({ error: 'Er zijn geen zwakke leerdoelen voor dit vak.' }, 400);
    }

    if (objectiveIds.length) {
      const oCh = db.prepare(`SELECT DISTINCT chapter_id FROM objectives WHERE id IN (${objectiveIds.map(() => '?').join(',')})`).all(...objectiveIds) as { chapter_id: string }[];
      chapterIds = [...new Set([...chapterIds, ...oCh.map((c) => c.chapter_id)])];
    }
    if (!chapterIds.length) {
      const cAll = db.prepare('SELECT id FROM chapters WHERE subject_id = ? AND user_id = ?').all(body.subjectId, u.id) as { id: string }[];
      chapterIds = cAll.map((c) => c.id);
    }
    if (!chapterIds.length) return ok({ error: 'Dit vak heeft nog geen hoofdstukken met leerstof. Voeg eerst documenten of hoofdstukken toe.' }, 400);

    const chapters = chapterIds.map((cid) => db.prepare('SELECT id, title, summary FROM chapters WHERE id = ? AND user_id = ?').get(cid, u.id) as { id: string; title: string; summary: string | null });
    const objectives = objectiveIds.length
      ? (objectiveIds.map((oid) => db.prepare('SELECT id, title FROM objectives WHERE id = ? AND user_id = ?').get(oid, u.id) as { id: string; title: string } | undefined)).filter((o): o is { id: string; title: string } => o !== undefined)
      : chapterIds.flatMap((cid) => db.prepare('SELECT id, title FROM objectives WHERE chapter_id = ? AND user_id = ?').all(cid, u.id) as { id: string; title: string }[]);

    const sourceText = chapters
      .map((c) => {
        const docs = db.prepare('SELECT title, text FROM documents WHERE (chapter_id = ? OR (subject_id = ? AND chapter_id IS NULL))').all(c.id, body.subjectId) as { title: string; text: string }[];
        if (docs.length === 0) return `[${c.title}]\n${c.summary ?? ''}`;
        return `[${c.title}]\n${docs.map((d) => d.text).join('\n\n')}`;
      })
      .join('\n\n');
    if (!sourceText.trim()) return ok({ error: 'Er is geen leerstof beschikbaar voor dit bereik. Voeg eerst documenten toe.' }, 400);

    const existingQuestions = (
      db.prepare(`SELECT prompt FROM questions WHERE user_id = ? AND subject_id = ? ORDER BY created_at DESC LIMIT 40`).all(u.id, body.subjectId) as { prompt: string }[]
    ).map((q) => q.prompt);

    const settings = (db.prepare('SELECT settings FROM users WHERE id = ?').get(u.id) as { settings: string }).settings;
    const aiModel = (JSON.parse(settings) as { aiModel?: string }).aiModel;

    const generated = await generateQuizQuestions(u.id, {
      subjectName: subject.name,
      chapters: chapters.map((c) => ({ id: c.id, title: c.title })),
      objectives,
      sourceText,
      count: body.count,
      types: body.types,
      difficulty: body.difficulty,
      language: (JSON.parse(settings) as { language?: string }).language || 'nl',
      existingQuestions
    }, aiModel);
    if (!generated.length) return ok({ error: 'De AI kon geen vragen genereren. Probeer opnieuw.' }, 502);

    const quizTitle = body.mode === 'exam_mock' ? `Proefexamen: ${subject.name}` : body.title;
    const qid = id('q_');
    if (body.save) {
      db.prepare('INSERT INTO quizzes (id, user_id, subject_id, title, origin, settings, objective_ids, source_note) VALUES (?,?,?,?,?,?,?,?)').run(
        qid, u.id, body.subjectId, quizTitle,
        body.mode === 'exam_mock' ? 'exam_mock' : 'ai',
        JSON.stringify({ difficulty: body.difficulty, types: body.types }),
        JSON.stringify(objectiveIds), null
      );
      const ins = db.prepare(
        `INSERT INTO questions (id, quiz_id, user_id, subject_id, type, prompt, context, options, answer, hint, explanation, points, difficulty, objective_ids, source_ref, position)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      );
      generated.forEach((q, i) => {
        ins.run(
          id('qst_'), qid, u.id, body.subjectId, q.type, q.prompt, q.context ?? null,
          JSON.stringify(q.options ?? []), JSON.stringify(q.answer), q.hint ?? null, q.explanation,
          q.points ?? 1, q.difficulty, JSON.stringify(q.objectiveIds ?? []), JSON.stringify(q.sourceRef ?? null), i
        );
      });
    }
    return ok({ id: body.save ? qid : null, count: generated.length, questions: generated });
  });
}
