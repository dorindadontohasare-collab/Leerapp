import { z } from 'zod';
import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { id } from '@/lib/auth';

const create = z.object({
  title: z.string().min(1).max(200),
  kind: z.enum(['exam', 'test', 'deadline', 'study']).default('study'),
  date: z.string(),
  time: z.string().nullable().optional(),
  durationMin: z.number().int().min(5).max(1440).default(60),
  subjectId: z.string().nullable().optional(),
  description: z.string().max(1000).nullable().optional()
});

export async function GET(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const db = getDb();
    const p = new URL(req.url).searchParams;
    const from = p.get('from');
    const to = p.get('to');
    const events = db.prepare(
      `SELECT e.*, s.name subjectName, s.color subjectColor FROM calendar_events e LEFT JOIN subjects s ON s.id = e.subject_id
       WHERE e.user_id = ? ${from ? 'AND e.date >= ?' : ''} ${to ? 'AND e.date <= ?' : ''} ORDER BY e.date, e.time`
    ).all(...(from ? [u.id, from] : [u.id]), ...(to ? [to] : []));
    return ok({ events });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const body = create.parse(await req.json());
    const db = getDb();
    const eid = id('ce_');
    db.prepare('INSERT INTO calendar_events (id, user_id, title, kind, date, time, duration_min, subject_id, description) VALUES (?,?,?,?,?,?,?,?,?)').run(
      eid, u.id, body.title, body.kind, body.date, body.time ?? null, body.durationMin, body.subjectId ?? null, body.description ?? null
    );
    return ok({ id: eid }, 201);
  });
}
