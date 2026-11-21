import { z } from 'zod';
import { requireUser, isUser, ok, fail, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { id } from '@/lib/auth';

const create = z.object({
  chapterId: z.string().min(1),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional()
});

export async function POST(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const body = create.parse(await req.json());
    const db = getDb();
    const ch = db.prepare('SELECT subject_id FROM chapters WHERE id = ? AND user_id = ?').get(body.chapterId, u.id) as
      | { subject_id: string }
      | undefined;
    if (!ch) return fail('Hoofdstuk niet gevonden', 404);
    const oid = id('o_');
    db.prepare('INSERT INTO objectives (id, user_id, subject_id, chapter_id, title, description) VALUES (?,?,?,?,?,?)').run(
      oid, u.id, ch.subject_id, body.chapterId, body.title, body.description ?? null
    );
    return ok({ id: oid }, 201);
  });
}
