import { z } from 'zod';
import { requireUser, isUser, ok, fail, handle } from '@/lib/api';
import { getDb } from '@/lib/db';

const patch = z.object({
  name: z.string().min(1).max(80).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().max(40).optional(),
  description: z.string().max(500).optional(),
  archived: z.boolean().optional()
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const body = patch.parse(await req.json());
    const db = getDb();
    const fields = Object.keys(body);
    if (!fields.length) return fail('Geen velden', 400);
    const set = fields.map((f) => `${f} = ?`).join(', ');
    const vals = fields.map((f) => (body as Record<string, unknown>)[f]);
    db.prepare(`UPDATE subjects SET ${set} WHERE id = ? AND user_id = ?`).run(...vals, id, u.id);
    return ok({ ok: true });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const db = getDb();
    db.prepare('DELETE FROM subjects WHERE id = ? AND user_id = ?').run(id, u.id);
    return ok({ ok: true });
  });
}
