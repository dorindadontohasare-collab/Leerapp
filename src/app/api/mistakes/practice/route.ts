import { z } from 'zod';
import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { id } from '@/lib/auth';
import { generateQuizQuestions } from '@/lib/ai/tasks';
import { isAiConfigured } from '@/lib/ai/client';

export const maxDuration = 300;

const schema = z.object({
  mistakeIds: z.array(z.string()).min(1).max(20),
  count: z.number().int().min(3).max(20).default(8)
});

export async function POST(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const body = schema.parse(await req.json());
    const db = getDb();

    if (!isAiConfigured()) {
      return ok({ error: 'AI is niet geconfigureerd. Voeg MISTRAL_API_KEY toe (zie README) om vergelijkbare oefenvragen te genereren.', configured: false }, 503);
    }

    const qm = body.mistakeIds.map(() => '?').join(',');
    const mistakes = db.prepare(
      `SELECT m.id, m.question_text, m.user_answer, m.correct_answer, m.explanation, m.subject_id, m.objective_id, s.name subjectName
       FROM mistakes m LEFT JOIN subjects s ON s.id = m.subject_id
       WHERE m.user_id = ? AND m.id IN (${qm})`
    ).all(u.id, ...body.mistakeIds) as { id: string; question_text: string; user_answer: string | null; correct_answer: string | null; explanation: string | null; subject_id: string | null; objective_id: string | null; subjectName: string | null }[];
    if (!mistakes.length) return ok({ error: 'Fouten niet gevonden.' }, 404);

    const subjectId = mistakes.find((m) => m.subject_id)?.subject_id ?? null;
    const subjectName = mistakes.find((m) => m.subjectName)?.subjectName ?? 'Leerstof uit foutbibliotheek';
    const objectiveIds = [...new Set(mistakes.map((m) => m.objective_id).filter((x): x is string => Boolean(x)))];

    const sourceText = mistakes.map((m) =>
      `[FOUT VRAAG]\nVraag: ${m.question_text}\nGegeven antwoord: ${m.user_answer ?? '(leeg)'}\nJuiste antwoord: ${m.correct_answer ?? '(onbekend)'}\nUitleg: ${m.explanation ?? '(geen)'}`
    ).join('\n\n');
    const localObjectives = objectiveIds.length
      ? (objectiveIds.map((oid) => db.prepare('SELECT id, title FROM objectives WHERE id = ? AND user_id = ?').get(oid, u.id) as { id: string; title: string } | undefined)).filter((o): o is { id: string; title: string } => o !== undefined)
      : [];

    const settings = JSON.parse((db.prepare('SELECT settings FROM users WHERE id = ?').get(u.id) as { settings: string }).settings);
    const generated = await generateQuizQuestions(u.id, {
      subjectName,
      chapters: [],
      objectives: localObjectives,
      sourceText: `${sourceText}\n\nMaak NIEUWE oefenvragen over dezelfde onderwerpen en dezelfde soort fouten. Verzin geen nieuwe inhoud buiten deze onderwerpen.`,
      count: body.count,
      types: ['mc_single', 'open', 'fill', 'true_false', 'concept'],
      difficulty: 'easy',
      language: settings.language || 'nl',
      existingQuestions: mistakes.map((m) => m.question_text)
    }, settings.aiModel);
    if (!generated.length) return ok({ error: 'De AI kon geen oefenvragen maken. Probeer opnieuw.' }, 502);

    const qid = id('q_');
    db.prepare('INSERT INTO quizzes (id, user_id, subject_id, title, origin, settings, objective_ids, source_note) VALUES (?,?,?,?,?,?,?,?)').run(
      qid, u.id, subjectId, 'Oefenronde: foutbibliotheek', 'ai',
      JSON.stringify({ difficulty: 'easy', types: ['mc_single', 'open', 'fill', 'true_false', 'concept'], mistakePractice: true }),
      JSON.stringify(objectiveIds), null
    );
    const ins = db.prepare(
      `INSERT INTO questions (id, quiz_id, user_id, subject_id, type, prompt, context, options, answer, hint, explanation, points, difficulty, objective_ids, source_ref, position)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    generated.forEach((q, i) => {
      ins.run(
        id('qst_'), qid, u.id, subjectId, q.type, q.prompt, q.context ?? null,
        JSON.stringify(q.options ?? []), JSON.stringify(q.answer), q.hint ?? null, q.explanation,
        q.points ?? 1, q.difficulty, JSON.stringify(q.objectiveIds ?? objectiveIds), JSON.stringify(q.sourceRef ?? null), i
      );
    });

    db.prepare(`UPDATE mistakes SET last_practiced_at = datetime('now') WHERE user_id = ? AND id IN (${qm})`).run(u.id, ...body.mistakeIds);

    return ok({ quizId: qid, count: generated.length });
  });
}
