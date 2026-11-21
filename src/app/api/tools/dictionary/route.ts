import { z } from 'zod';
import { requireUser, isUser, ok, handle } from '@/lib/api';
import { dictionaryLookup } from '@/lib/ai/tasks';
import { isAiConfigured } from '@/lib/ai/client';
import { getDb } from '@/lib/db';

const schema = z.object({ term: z.string().min(1).max(120), simple: z.boolean().default(false) });

export async function POST(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const body = schema.parse(await req.json());
    if (!isAiConfigured()) return ok({ error: 'AI is niet geconfigureerd. Voeg MISTRAL_API_KEY toe (zie README).', configured: false }, 503);
    const db = getDb();
    const settings = JSON.parse((db.prepare('SELECT settings FROM users WHERE id = ?').get(u.id) as { settings: string }).settings);
    const result = await dictionaryLookup(u.id, body.term, settings.language || 'nl', body.simple, settings.aiModel);
    return ok(result);
  });
}
