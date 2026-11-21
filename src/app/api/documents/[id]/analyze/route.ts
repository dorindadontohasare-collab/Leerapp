import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { callAi, parseJsonLoose, isAiConfigured } from '@/lib/ai/client';
import { analyzeDocument } from '@/lib/ai/tasks';
import { awardXp } from '@/lib/gamification';
import fs from 'fs';

export const maxDuration = 300;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const db = getDb();
    const doc = db.prepare('SELECT id, kind, storage_path, title, text FROM documents WHERE id = ? AND user_id = ?').get(id, u.id) as
      | { id: string; kind: string; storage_path: string | null; title: string; text: string; }
      | undefined;
    if (!doc) return ok({ error: 'Niet gevonden' }, 404);

    if (!isAiConfigured()) {
      return ok({ error: 'AI is niet geconfigureerd. Voeg MISTRAL_API_KEY toe aan de omgevingsvariabelen (zie README).', configured: false }, 503);
    }

    const settings = (db.prepare('SELECT settings FROM users WHERE id = ?').get(u.id) as { settings: string }).settings;
    const aiModel = (JSON.parse(settings) as { aiModel?: string }).aiModel;

    const vsys = 'Je leest tekst van een afbeelding (OCR) van studiemateriaal. Geef uitsluitend JSON: {"ocr": string (de volledig gelezen tekst bij elkaar), "language": string}. Sla onleesbare delen over; laat onleesbare delen weg en vermeld dat in ocr als "[onleesbaar]".';
    if (doc.kind === 'image' && doc.storage_path) {
      const buf = fs.readFileSync(doc.storage_path);
      const b64 = buf.toString('base64');
      const { content } = await callAi({
        userId: u.id,
        userPreference: aiModel,
        task: 'vision_ocr',
        messages: [
          { role: 'system', content: vsys },
          { role: 'user', content: [{ type: 'text', text: 'Lees alle tekst van deze afbeelding.' }, { type: 'image_url', image_url: `data:image/${doc.storage_path.endsWith('.png') ? 'png' : 'jpeg'};base64,${b64}` }] }
        ],
        responseFormat: 'json',
        maxTokens: 4000
      });
      const ocr = parseJsonLoose<{ ocr: string }>(content);
      if (!ocr.ocr.trim()) {
        return ok({ error: 'Er kon geen tekst worden gelezen.', configured: true }, 422);
      }
      db.prepare('UPDATE documents SET text = ?, analysis_status = ? WHERE id = ? AND user_id = ?').run(ocr.ocr, 'ocr_done', id, u.id);
    } else if (!doc.text.trim()) {
      return ok({ error: 'Geen tekst beschikbaar. Upload een tekstbestand of gebruik OCR.', configured: true }, 422);
    }

    const analysis = await analyzeDocument(u.id, id, aiModel);
    awardXp(u.id, 'document_analyzed');
    return ok({ analysis });
  });
}
