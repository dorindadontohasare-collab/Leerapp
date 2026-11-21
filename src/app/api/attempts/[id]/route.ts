import { requireUser, isUser, ok, fail, handle } from '@/lib/api';
import { getDb } from '@/lib/db';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const db = getDb();
    const attempt = db.prepare(
      `SELECT a.*, q.title quizTitle, q.subject_id FROM attempts a JOIN quizzes q ON q.id = a.quiz_id WHERE a.id = ? AND a.user_id = ?`
    ).get(id, u.id) as Record<string, unknown> | undefined;
    if (!attempt) return fail('Poging niet gevonden.', 404);
    const snapshot = JSON.parse(attempt.snapshot as string) as { order: string[]; feedbackMode?: string };
    const saved = db.prepare('SELECT question_id, answer, graded, time_ms FROM attempt_answers WHERE attempt_id = ?').all(id) as
      | { question_id: string; answer: string; graded: string | null; time_ms: number | null }[];
    const savedMap = new Map(saved.map((s) => [s.question_id, s]));
    const questions = snapshot.order.map((qid) => db.prepare(
      'SELECT id, type, prompt, context, options, hint, points, difficulty, objective_ids, source_ref, answer FROM questions WHERE id = ?'
    ).get(qid) as Record<string, unknown> | undefined).filter((q): q is Record<string, unknown> => q !== undefined).map((q) => {
      const save = savedMap.get(q.id as string);
      const options = JSON.parse(q.options as string);
      const hasCorrectMark = (options as { correct?: boolean }[]).some((o) => o.correct === undefined ? false : o.correct);
      return {
        id: q.id, type: q.type, prompt: q.prompt, context: q.context, options, hint: q.hint,
        points: q.points, difficulty: q.difficulty, objective_ids: JSON.parse(q.objective_ids as string),
        source_ref: q.source_ref ? JSON.parse(q.source_ref as string) : null,
        savedAnswer: save ? JSON.parse(save.answer) : null,
        priorGraded: save?.graded ? JSON.parse(save.graded) : null
      };
    });
    return ok({
      attempt: {
        id: attempt.id, quizId: attempt.quiz_id, mode: attempt.mode, status: attempt.status,
        startedAt: attempt.started_at, finishedAt: attempt.finished_at, quizTitle: attempt.quizTitle,
        score: attempt.score, maxScore: attempt.max_score, percent: attempt.percent, durationS: attempt.duration_s
      },
      feedbackMode: snapshot.feedbackMode ?? 'immediate',
      answers: saved
    });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const db = getDb();
    db.prepare(`UPDATE attempts SET status = 'abandoned', finished_at = datetime('now') WHERE id = ? AND user_id = ?`).run(id, u.id);
    return ok({ ok: true });
  });
}
