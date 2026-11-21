import { z } from 'zod';
import { getDb } from '@/lib/db';
import { hashPassword, id, setSessionCookie } from '@/lib/auth';
import { handle, ok, fail } from '@/lib/api';

const schema = z.object({ email: z.string().email(), password: z.string().min(8, 'Minimaal 8 tekens'), name: z.string().min(2) });

export async function POST(req: Request) {
  return handle(async () => {
    const body = schema.parse(await req.json());
    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(body.email.toLowerCase());
    if (existing) return fail('Er bestaat al een account met dit e-mailadres.', 409);
    const uid = id('u_');
    const settings = JSON.stringify({
      theme: 'system', language: 'nl', aiModel: 'auto', aiDetail: 'gebalanceerd', aiAnswerLength: 'normaal',
      aiBehavior: 'encouraging', notifications: { daily: true, exam: true, flashcards: true, breaks: false },
      coachContextScope: 'chapter'
    });
    db.prepare('INSERT INTO users (id, email, password_hash, name, settings) VALUES (?,?,?,?,?)').run(
      uid, body.email.toLowerCase(), await hashPassword(body.password), body.name, settings
    );
    await setSessionCookie(uid);
    return ok({ ok: true }, 201);
  });
}
