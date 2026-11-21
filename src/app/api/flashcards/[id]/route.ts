import { z } from 'zod';
import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';

const patch = z.object({
  front: z.string().min(1).optional(),
  back: z.string().min(1).optional(),
  hint: z.string().nullable().optional(),
  subjectId: z.string().nullable().optional(),
  chapterId: z.string().nullable().optional(),
  objectiveId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional()
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const body = patch.parse(await req.json());
    const db = getDb();
    const update = { ...body };
    if (update.tags) update.tags = undefined;
    const fields = Object.keys(update).filter((f) => update[f as keyof typeof update] !== undefined || (update as Record<string, unknown>)[f] === null);
    if (fields.length) {
      const set = fields.map((f) => `${f} = ?`).join(', ');
      db.prepare(`UPDATE flashcards SET ${set} WHERE id = ? AND user_id = ?`).run(
        ...fields.map((f) => (body as Record<string, unknown>)[f] ?? null), id, u.id
      );
    }
    if (body.tags) db.prepare('UPDATE flashcards SET tags = ? WHERE id = ? AND user_id = ?').run(JSON.stringify(body.tags), id, u.id);
    return ok({ ok: true });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const db = getDb();
    db.prepare('DELETE FROM flashcards WHERE id = ? AND user_id = ?').run(id, u.id);
    return ok({ ok: true });
  });
}
