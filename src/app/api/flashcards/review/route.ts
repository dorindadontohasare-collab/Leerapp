import { z } from 'zod';
import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { nextSrs } from '@/lib/srs';
import { recordMasteryEvent, recalcMastery } from '@/lib/mastery';
import { awardXp } from '@/lib/gamification';
import { id } from '@/lib/auth';

const schema = z.object({ cardId: z.string(), grade: z.number().int().min(0).max(5), timeMs: z.number().optional(), objectiveId: z.string().nullable().optional() });

export async function POST(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const body = schema.parse(await req.json());
    const db = getDb();
    const card = db.prepare('SELECT id, objective_id FROM flashcards WHERE id = ? AND user_id = ?').get(body.cardId, u.id) as
      | { id: string; objective_id: string | null } | undefined;
    if (!card) return ok({ error: 'Kaart niet gevonden' }, 404);
    const existing = db.prepare('SELECT ease, interval_days, reps, lapses FROM card_state WHERE user_id = ? AND card_id = ?').get(u.id, body.cardId) as
      | { ease: number; interval_days: number; reps: number; lapses: number } | undefined;
    const next = nextSrs(existing ?? { ease: 2.5, interval_days: 0, reps: 0, lapses: 0 }, body.grade);
    db.prepare(`INSERT INTO card_state (user_id, card_id, ease, interval_days, due_at, reps, lapses, correct_count, last_grade, avg_time_ms)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id, card_id) DO UPDATE SET ease = excluded.ease, interval_days = excluded.interval_days, due_at = excluded.due_at,
      reps = excluded.reps, lapses = excluded.lapses,
      correct_count = correct_count + (CASE WHEN excluded.last_grade >= 3 THEN 1 ELSE 0 END),
      last_grade = excluded.last_grade,
      avg_time_ms = COALESCE((avg_time_ms * reps + excluded.avg_time_ms) / (reps + 1), excluded.avg_time_ms)`).run(
      u.id, body.cardId, next.ease, next.interval_days, next.due_at, next.reps, next.lapses,
      body.grade >= 3 ? 1 : 0, body.grade, body.timeMs ?? null
    );
    const oid = body.objectiveId ?? card.objective_id;
    if (oid) {
      recordMasteryEvent({ userId: u.id, objectiveId: oid, source: 'flashcard', sourceId: body.cardId, correctness: body.grade >= 3 ? 1 : 0, difficulty: 1, autonomy: 'independent' });
      recalcMastery(u.id, oid);
    }
    awardXp(u.id, 'flashcard_review');
    return ok({ next: { due_at: next.due_at, interval_days: next.interval_days, ease: next.ease } });
  });
}
