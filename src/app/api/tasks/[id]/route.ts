import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { awardXp } from '@/lib/gamification';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const body = (await req.json()) as { status?: string; minutes?: number; dueDate?: string | null; title?: string };
    const db = getDb();
    const fields = Object.keys(body);
    if (!fields.length) return ok({ ok: true });
    const set = fields.map((f) => `${f === 'dueDate' ? 'due_date' : f} = ?`).join(', ');
    const vals = fields.map((f) => f === 'dueDate' ? body.dueDate ?? null : (body as Record<string, unknown>)[f]);
    db.prepare(`UPDATE plan_tasks SET ${set} WHERE id = ? AND user_id = ?`).run(...vals, id, u.id);
    if (body.status === 'done') {
      awardXp(u.id, 'plan_task_done', { minutes: body.minutes ?? 0 });
      db.prepare(`INSERT INTO events (id, user_id, kind, minutes, xp, payload) VALUES (?,?,?,?,0,?)`).run(
        'ev_' + Math.random().toString(36).slice(2), u.id, 'manual_task_done', body.minutes ?? 0, JSON.stringify({ taskId: id })
      );
    }
    return ok({ ok: true });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const db = getDb();
    db.prepare('DELETE FROM plan_tasks WHERE id = ? AND user_id = ?').run(id, u.id);
    return ok({ ok: true });
  });
}
