import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const db = getDb();
    const quiz = db.prepare(
      `SELECT q.*, s.name subjectName FROM quizzes q LEFT JOIN subjects s ON s.id = q.subject_id WHERE q.id = ? AND q.user_id = ?`
    ).get(id, u.id) as Record<string, unknown> | undefined;
    if (!quiz) return ok({ error: 'Niet gevonden' }, 404);
    const questions = db.prepare(
      `SELECT q.id, q.type, q.prompt, q.context, q.options, q.hint, q.points, q.difficulty, q.objective_ids, q.source_ref, q.position,
        o.title objectiveTitle
       FROM questions q LEFT JOIN objectives o ON o.id = json_extract(q.objective_ids, '$[0]')
       WHERE q.quiz_id = ? ORDER BY q.position`
    ).all(id) as Record<string, unknown>[];
    const attempts = db.prepare(
      `SELECT id, mode, status, score, max_score, percent, duration_s, started_at, finished_at FROM attempts WHERE quiz_id = ? AND user_id = ? ORDER BY started_at DESC`
    ).all(id, u.id);
    return ok({
      quiz: { ...quiz, settings: JSON.parse(quiz.settings as string) },
      questions: questions.map((q: Record<string, unknown>) => ({
        ...q,
        options: JSON.parse(q.options as string),
        objective_ids: JSON.parse(q.objective_ids as string),
        source_ref: q.source_ref ? JSON.parse(q.source_ref as string) : null
      })),
      attempts
    });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const db = getDb();
    db.prepare('DELETE FROM quizzes WHERE id = ? AND user_id = ?').run(id, u.id);
    return ok({ ok: true });
  });
}
