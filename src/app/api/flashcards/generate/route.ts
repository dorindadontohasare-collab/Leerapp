import { z } from 'zod';
import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { id } from '@/lib/auth';
import { generateFlashcards } from '@/lib/ai/tasks';
import { isAiConfigured } from '@/lib/ai/client';

const schema = z.object({
  source: z.enum(['document', 'subject', 'text']).default('document'),
  documentId: z.string().nullable().optional(),
  subjectId: z.string().min(1),
  chapterId: z.string().nullable().optional(),
  text: z.string().optional(),
  count: z.number().int().min(1).max(60).default(15)
});

export async function POST(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const body = schema.parse(await req.json());
    const db = getDb();
    if (!isAiConfigured()) return ok({ error: 'AI is niet geconfigureerd. Voeg MISTRAL_API_KEY toe (zie README).', configured: false }, 503);

    let text = body.text ?? '';
    if (body.source === 'document' && body.documentId) {
      const doc = db.prepare('SELECT text FROM documents WHERE id = ? AND user_id = ?').get(body.documentId, u.id) as { text: string } | undefined;
      if (!doc) return ok({ error: 'Document niet gevonden' }, 404);
      text = doc.text;
    }
    if (!text.trim()) return ok({ error: 'Geen tekst beschikbaar om kaarten van te maken.' }, 400);
    const subject = db.prepare('SELECT name FROM subjects WHERE id = ? AND user_id = ?').get(body.subjectId, u.id) as { name: string } | undefined;
    const objectiveMap = (db.prepare('SELECT id, title FROM objectives WHERE user_id = ? AND subject_id = ?').all(u.id, body.subjectId) as { id: string; title: string }[]);
    const settings = JSON.parse((db.prepare('SELECT settings FROM users WHERE id = ?').get(u.id) as { settings: string }).settings);
    const cards = await generateFlashcards(u.id, {
      text, count: body.count, subject: subject?.name ?? '', objectiveMap, language: settings.language || 'nl'
    }, settings.aiModel);
    const created: string[] = [];
    for (const card of cards.slice(0, body.count)) {
      const fid = id('f_');
      db.prepare('INSERT INTO flashcards (id, user_id, subject_id, chapter_id, objective_id, front, back, hint, origin) VALUES (?,?,?,?,?,?,?,?,?)').run(
        fid, u.id, body.subjectId, body.chapterId ?? null, card.objectiveId && objectiveMap.some((o) => o.id === card.objectiveId) ? card.objectiveId : null,
        card.front, card.back, card.hint ?? null, 'ai'
      );
      created.push(fid);
    }
    return ok({ created: created.length });
  });
}
