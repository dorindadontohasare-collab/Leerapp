import { z } from 'zod';
import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { id } from '@/lib/auth';

const create = z.object({
  title: z.string().min(1).max(200),
  subjectId: z.string().nullable().optional(),
  objectiveId: z.string().nullable().optional(),
  minutes: z.number().int().min(5).max(600).default(30),
  dueDate: z.string().nullable().optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal')
});

export async function GET(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const db = getDb();
    const p = new URL(req.url).searchParams;
    const rows = db.prepare(
      `SELECT t.*, s.name subjectName, o.title objectiveTitle, o.mastery_score objectiveScore FROM plan_tasks t
       LEFT JOIN subjects s ON s.id = t.subject_id LEFT JOIN objectives o ON o.id = t.objective_id
       WHERE t.user_id = ? ${p.get('open') ? "AND t.status = 'open'" : ''} ORDER BY t.due_date ASC, t.created_at DESC`
    ).all(u.id);
    return ok({ tasks: rows });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const body = create.parse(await req.json());
    const db = getDb();
    const tid = id('t_');
    db.prepare('INSERT INTO plan_tasks (id, user_id, subject_id, objective_id, title, minutes, due_date, priority) VALUES (?,?,?,?,?,?,?,?)').run(
      tid, u.id, body.subjectId ?? null, body.objectiveId ?? null, body.title, body.minutes, body.dueDate ?? null, body.priority
    );
    return ok({ id: tid }, 201);
  });
}
