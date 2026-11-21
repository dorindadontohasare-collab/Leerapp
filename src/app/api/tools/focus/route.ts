import { z } from 'zod';
import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { awardXp } from '@/lib/gamification';

const schema = z.object({ minutes: z.number().int().min(1).max(240), subjectId: z.string().nullable().optional() });

export async function POST(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const body = schema.parse(await req.json());
    const db = getDb();
    db.prepare('INSERT INTO events (id, user_id, kind, minutes, xp, subject_id, payload) VALUES (?,?,?,?,0,?,?)').run(
      'ev_f_' + Math.random().toString(36).slice(2), u.id, 'focus_done', body.minutes, body.subjectId ?? null, JSON.stringify({ minutes: body.minutes })
    );
    awardXp(u.id, 'focus_done', { minutes: body.minutes });
    const xp = (db.prepare('SELECT xp FROM users WHERE id = ?').get(u.id) as { xp: number }).xp;
    return ok({ ok: true, xp });
  });
}
