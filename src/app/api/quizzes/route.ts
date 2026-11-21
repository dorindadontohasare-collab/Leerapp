import { z } from 'zod';
import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { id } from '@/lib/auth';

const create = z.object({
  title: z.string().min(1).max(200),
  subjectId: z.string().nullable().optional(),
  chapterId: z.string().nullable().optional(),
  settings: z.record(z.unknown()).default({}),
  questions: z.array(z.object({
    type: z.enum(['mc_single','mc_multi','open','fill','true_false','match','sort','drag','numeric','chart','case','application','concept','compare','steps']),
    prompt: z.string().min(1),
    context: z.string().optional(),
    options: z.array(z.object({ id: z.string(), text: z.string(), correct: z.boolean().optional() })).optional(),
    answer: z.record(z.unknown()),
    hint: z.string().nullable().optional(),
    explanation: z.string().nullable().optional(),
    points: z.number().default(1),
    difficulty: z.number().int().min(1).max(3).default(2),
    objectiveIds: z.array(z.string()).default([]),
    sourceRef: z.record(z.unknown()).nullable().optional()
  })).min(1)
});

export async function GET() {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const db = getDb();
    const rows = db.prepare(
      `SELECT q.id, q.title, q.origin, q.settings, q.subject_id, q.chapter_id, q.created_at,
        s.name subjectName, c.title chapterTitle,
        (SELECT COUNT(*) FROM questions qs WHERE qs.quiz_id = q.id) questionCount,
        (SELECT COUNT(*) FROM attempts a WHERE a.quiz_id = q.id AND a.status = 'finished') attemptCount,
        (SELECT COALESCE(AVG(percent),0) FROM attempts a WHERE a.quiz_id = q.id AND a.status = 'finished') avgPercent
       FROM quizzes q LEFT JOIN subjects s ON s.id = q.subject_id LEFT JOIN chapters c ON c.id = q.chapter_id
       WHERE q.user_id = ? ORDER BY q.created_at DESC`
    ).all(u.id);
    return ok({ quizzes: rows });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const body = create.parse(await req.json());
    const db = getDb();
    const qid = id('q_');
    db.prepare('INSERT INTO quizzes (id, user_id, subject_id, chapter_id, title, origin, settings, objective_ids) VALUES (?,?,?,?,?,?,?,?)').run(
      qid, u.id, body.subjectId ?? null, body.chapterId ?? null, body.title, 'manual', JSON.stringify(body.settings),
      JSON.stringify([...new Set(body.questions.flatMap((q) => q.objectiveIds ?? []))])
    );
    const ins = db.prepare(
      `INSERT INTO questions (id, quiz_id, user_id, subject_id, chapter_id, type, prompt, context, options, answer, hint, explanation, points, difficulty, objective_ids, source_ref, position)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    body.questions.forEach((q, i) => {
      ins.run(
        id('qst_'), qid, u.id, body.subjectId ?? null, body.chapterId ?? null, q.type, q.prompt, q.context ?? null,
        JSON.stringify(q.options ?? []), JSON.stringify(q.answer), q.hint ?? null, q.explanation ?? null,
        q.points, q.difficulty, JSON.stringify(q.objectiveIds ?? []), JSON.stringify(q.sourceRef ?? null), i
      );
    });
    return ok({ id: qid }, 201);
  });
}
