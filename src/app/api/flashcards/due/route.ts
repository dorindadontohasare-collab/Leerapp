import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';

export async function GET(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const db = getDb();
    const subjectId = new URL(req.url).searchParams.get('subjectId');
    const rows = db.prepare(
      `SELECT f.id, f.front, f.back, f.hint, f.objective_id, f.subject_id, cs.reps, cs.ease, cs.interval_days, cs.lapses, cs.due_at
       FROM flashcards f LEFT JOIN card_state cs ON cs.user_id = f.user_id AND cs.card_id = f.id
       WHERE f.user_id = ? AND (cs.due_at IS NULL OR cs.due_at <= datetime('now')) ${subjectId ? 'AND f.subject_id = ?' : ''}
       ORDER BY COALESCE(cs.due_at, '1970-01-01') ASC LIMIT 100`
    ).all(...(subjectId ? [u.id, subjectId] : [u.id])) as { id: string; front: string; back: string; hint: string | null; objective_id: string | null; subject_id: string | null; reps: number | null; ease: number | null; interval_days: number | null; lapses: number | null; due_at: string | null }[];
    return ok({ due: rows.map((r) => ({
      id: r.id, front: r.front, back: r.back, hint: r.hint, objectiveId: r.objective_id, subjectId: r.subject_id,
      state: { ease: r.ease ?? 2.5, reps: r.reps ?? 0, interval_days: r.interval_days ?? 0, lapses: r.lapses ?? 0, due_at: r.due_at ?? 'now' }
    })) });
  });
}
