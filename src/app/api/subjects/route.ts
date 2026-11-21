import { z } from 'zod';
import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { id } from '@/lib/auth';

const create = z.object({
  name: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().max(40).optional(),
  description: z.string().max(500).optional()
});

export async function POST(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const body = create.parse(await req.json());
    const db = getDb();
    const sid = id('s_');
    db.prepare('INSERT INTO subjects (id, user_id, name, color, icon, description) VALUES (?,?,?,?,?,?)').run(
      sid, u.id, body.name, body.color ?? '#A9C9ED', body.icon ?? 'book', body.description ?? null
    );
    return ok({ id: sid }, 201);
  });
}

export async function GET() {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const rows = getDb().prepare('SELECT id, name, color, icon, description FROM subjects WHERE user_id = ? ORDER BY name').all(u.id);
    return ok({ subjects: rows });
  });
}
