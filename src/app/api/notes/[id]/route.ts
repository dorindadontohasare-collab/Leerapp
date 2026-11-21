import { z } from 'zod';
import { requireUser, isUser, ok, fail, handle } from '@/lib/api';
import { getDb } from '@/lib/db';

const patch = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(50000).optional(),
  subjectId: z.string().nullable().optional(),
  chapterId: z.string().nullable().optional()
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const body = patch.parse(await req.json());
    const db = getDb();
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(body)) {
      sets.push(`${k} = ?`);
      vals.push(v ?? null);
    }
    if (!sets.length) return fail('Geen wijzigingen', 400);
    vals.push(id, u.id);
    const r = db.prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
    if (r.changes === 0) return fail('Notitie niet gevonden', 404);
    return ok({ saved: true });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const r = getDb().prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(id, u.id);
    if (r.changes === 0) return fail('Notitie niet gevonden', 404);
    return ok({ deleted: true });
  });
}
