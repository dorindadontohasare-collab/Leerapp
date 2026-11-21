import { z } from 'zod';
import { requireUser, isUser, ok, fail, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { id as genId } from '@/lib/auth';

const patch = z.object({
  title: z.string().min(1).max(200).optional(),
  summary: z.string().max(2000).optional(),
  position: z.number().int().optional(),
  split: z.array(z.object({ title: z.string(), description: z.string().optional() })).optional()
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const body = patch.parse(await req.json());
    const db = getDb();
    const update = { ...body };
    if (update.split) {
      for (const [i, part] of update.split.entries()) {
        const oid = genId('o_');
        db.prepare('INSERT INTO objectives (id, user_id, subject_id, chapter_id, title, description, position) VALUES (?,?,?,?,?,?,?)').run(
          oid, u.id,
          (db.prepare('SELECT subject_id FROM chapters WHERE id = ? AND user_id = ?').get(id, u.id) as { subject_id: string }).subject_id,
          id, part.title, part.description ?? null, i
        );
      }
    }
    delete update.split;
    const fields = Object.keys(update);
    if (fields.length) {
      const set = fields.map((f) => `${f} = ?`).join(', ');
      const vals = fields.map((f) => (update as Record<string, unknown>)[f]);
      db.prepare(`UPDATE chapters SET ${set} WHERE id = ? AND user_id = ?`).run(...vals, id, u.id);
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
    db.prepare('DELETE FROM chapters WHERE id = ? AND user_id = ?').run(id, u.id);
    return ok({ ok: true });
  });
}
