import { z } from 'zod';
import { getDb } from '@/lib/db';
import { verifyPassword, setSessionCookie } from '@/lib/auth';
import { handle, ok, fail } from '@/lib/api';

const schema = z.object({ email: z.string().email(), password: z.string() });

export async function POST(req: Request) {
  return handle(async () => {
    const body = schema.parse(await req.json());
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(body.email.toLowerCase()) as
      | { id: string; password_hash: string | null }
      | undefined;
    if (!user || !user.password_hash || !(await verifyPassword(body.password, user.password_hash))) {
      return fail('Onjuiste inloggegevens.', 401);
    }
    await setSessionCookie(user.id);
    return ok({ ok: true });
  });
}
