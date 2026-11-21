import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const body = (await req.json()) as { date?: string; done?: boolean; time?: string | null; durationMin?: number; title?: string };
    const db = getDb();
    const fields = Object.keys(body);
    if (!fields.length) return ok({ ok: true });
    const set = fields.map((f) => `${f === 'date' ? 'date' : f === 'durationMin' ? 'duration_min' : f} = ?`).join(', ');
    db.prepare(`UPDATE calendar_events SET ${set} WHERE id = ? AND user_id = ?`).run(
      ...fields.map((f) => (body as Record<string, unknown>)[f] ?? null), id, u.id
    );
    return ok({ ok: true });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const db = getDb();
    db.prepare('DELETE FROM calendar_events WHERE id = ? AND user_id = ?').run(id, u.id);
    return ok({ ok: true });
  });
}
