import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getSessionUser, type SessionUser } from './auth';

export function ok<T>(data: T, init?: number) {
  return NextResponse.json(data, { status: init ?? 200 });
}

export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export async function requireUser(): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser();
  if (!user) return fail('Niet aangemeld', 401);
  return user;
}

export function isUser(u: SessionUser | NextResponse): u is SessionUser {
  return !(u instanceof NextResponse);
}

export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ZodError) {
      return fail('Validatiefout', 422, err.flatten());
    }
    console.error('[api]', err);
    const msg = err instanceof Error ? err.message : 'Onverwachte serverfout';
    return fail(msg, 500);
  }
}

export function parseBody<T>(schema: { parse: (v: unknown) => T }, body: unknown): T {
  return schema.parse(body);
}
