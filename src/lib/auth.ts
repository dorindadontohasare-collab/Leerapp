import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { getDb } from './db';

const secretString = process.env.AUTH_SECRET || 'dev-secret-change-me-in-env-0123456789abcdef';
const secret = new TextEncoder().encode(secretString);

export type SessionUser = { id: string; email: string; name: string };

export function id(prefix = ''): string {
  return prefix + crypto.randomUUID();
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret);
}

export async function setSessionCookie(userId: string): Promise<void> {
  const token = await createSessionToken(userId);
  const store = await cookies();
  store.set('sb_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
    path: '/'
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete('sb_session');
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get('sb_session')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub) return null;
    const db = getDb();
    const row = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(payload.sub) as
      | { id: string; email: string; name: string }
      | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
