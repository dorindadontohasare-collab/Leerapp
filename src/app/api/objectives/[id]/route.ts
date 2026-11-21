import { z } from 'zod';
import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { recalcMastery } from '@/lib/mastery';

const patch = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(2000).optional(),
  statusOverride: z.boolean().optional()
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const body = patch.parse(await req.json());
    const db = getDb();
    const fields = Object.keys(body);
    if (fields.length) {
      const set = fields.map((f) => `${f} = ?`).join(', ');
      const vals = fields.map((f) => (body as Record<string, unknown>)[f]);
      db.prepare(`UPDATE objectives SET ${set} WHERE id = ? AND user_id = ?`).run(...vals, id, u.id);
    }
    const detail = recalcMastery(u.id, id);
    return ok({ ok: true, mastery: detail });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const db = getDb();
    db.prepare('DELETE FROM objectives WHERE id = ? AND user_id = ?').run(id, u.id);
    return ok({ ok: true });
  });
}
