import { z } from 'zod';
import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { id } from '@/lib/auth';

const create = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(50000).default(''),
  subjectId: z.string().nullable().optional(),
  chapterId: z.string().nullable().optional()
});

export async function GET(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const subjectId = new URL(req.url).searchParams.get('subjectId');
    const db = getDb();
    const rows = subjectId
      ? db.prepare('SELECT * FROM notes WHERE user_id = ? AND subject_id = ? ORDER BY created_at DESC').all(u.id, subjectId)
      : db.prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC').all(u.id);
    return ok({ notes: rows });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const body = create.parse(await req.json());
    const nid = id('n_');
    getDb().prepare('INSERT INTO notes (id, user_id, subject_id, chapter_id, title, body) VALUES (?,?,?,?,?,?)').run(
      nid, u.id, body.subjectId ?? null, body.chapterId ?? null, body.title, body.body
    );
    return ok({ id: nid }, 201);
  });
}
