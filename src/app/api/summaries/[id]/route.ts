import { z } from 'zod';
import { requireUser, isUser, ok, fail, handle } from '@/lib/api';
import { getDb } from '@/lib/db';

const patch = z.object({ content: z.string().min(1).max(200000), title: z.string().max(200).optional() });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const body = patch.parse(await req.json());
    const db = getDb();
    const r = db.prepare('UPDATE summaries SET content = ?, origin = "ai_edited" WHERE id = ? AND user_id = ?').run(body.content, id, u.id);
    if (r.changes === 0) return fail('Samenvatting niet gevonden', 404);
    return ok({ saved: true });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const r = getDb().prepare('DELETE FROM summaries WHERE id = ? AND user_id = ?').run(id, u.id);
    if (r.changes === 0) return fail('Samenvatting niet gevonden', 404);
    return ok({ deleted: true });
  });
}
