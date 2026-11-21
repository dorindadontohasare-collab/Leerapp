import { z } from 'zod';
import { requireUser, isUser, ok, fail, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { id } from '@/lib/auth';

const create = z.object({ title: z.string().min(1).max(200), summary: z.string().max(2000).optional(), position: z.number().int().optional() });

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const db = getDb();
    const sub = db.prepare('SELECT id FROM subjects WHERE id = ? AND user_id = ?').get(id, u.id);
    if (!sub) return fail('Vak niet gevonden', 404);
    const rows = db.prepare('SELECT id, title, summary, position FROM chapters WHERE subject_id = ? AND user_id = ? ORDER BY position').all(id, u.id);
    return ok({ chapters: rows });
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id: sid } = await ctx.params;
    const body = create.parse(await req.json());
    const db = getDb();
    const cid = id('c_');
    const pos = body.position ?? (db.prepare('SELECT COALESCE(MAX(position),-1)+1 p FROM chapters WHERE subject_id = ? AND user_id = ?').get(sid, u.id) as { p: number }).p;
    db.prepare('INSERT INTO chapters (id, user_id, subject_id, title, summary, position) VALUES (?,?,?,?,?,?)').run(
      cid, u.id, sid, body.title, body.summary ?? null, pos
    );
    return ok({ id: cid }, 201);
  });
}
