import { requireUser, isUser, ok, fail, handle } from '@/lib/api';
import { getDb, UPLOAD_DIR } from '@/lib/db';
import { id } from '@/lib/auth';
import { extractText } from '@/lib/extract';
import { awardXp } from '@/lib/gamification';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const maxDuration = 300;

const MAX_SIZE = 40 * 1024 * 1024;

export async function GET() {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const db = getDb();
    const rows = db.prepare(
      `SELECT d.id, d.title, d.kind, d.source_url, d.mime, d.size, d.page_count, d.analysis_status, d.subject_id, d.chapter_id, d.error, d.created_at,
        s.name subjectName, c.title chapterTitle
       FROM documents d LEFT JOIN subjects s ON s.id = d.subject_id LEFT JOIN chapters c ON c.id = d.chapter_id
       WHERE d.user_id = ? ORDER BY d.created_at DESC`
    ).all(u.id);
    return ok({ documents: rows });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const form = await req.formData();
    const db = getDb();

    const mode = String(form.get('mode') || 'file');

    if (mode === 'text' || mode === 'url') {
      const title = String(form.get('title') || 'Naamloos').slice(0, 200);
      const text = String(form.get('text') || '').slice(0, 500000);
      const url = String(form.get('url') || '').slice(0, 500);
      const subjectId = (form.get('subjectId') as string) || null;
      if (url && !/^(https:\/\/|http:\/\/(www\.)?youtube\.com|http:\/\/youtu\.be)/.test(url)) {
        return fail('Alleen https:// URL, YouTube-link of gekopieerde tekst wordt ondersteund.', 400);
      }
      let kind: string = mode === 'url' ? 'url' : 'text';
      let body = text;
      let titleOut = title;
      if (url.includes('youtube.com') || url.includes('youtu.be')) kind = 'youtube';
      if (mode === 'url') {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'follow' });
          if (!res.ok) return fail(`De URL kon niet worden opgehaald (${res.status}).`, 400);
          const ctype = res.headers.get('content-type') || '';
          if (ctype.includes('text/html')) {
            const html = await res.text();
            const extractedTitle = html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? title;
            const bodyText = html
              .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
              .replace(/<[^>]+>/gi, ' ').replace(/&nbsp;/g, ' ').replace(/\s{3,}/g, '\n').trim();
            body = bodyText;
            titleOut = extractedTitle.trim().slice(0, 200) || title;
          } else if (ctype.includes('text/') || ctype.includes('json')) {
            body = await res.text();
            kind = 'text';
          } else {
            return fail('Dit URL-formaat wordt niet ondersteund (alleen HTML of tekst).', 400);
          }
        } catch { return fail('De URL kon niet worden opgehaald.', 400); }
      }
      if (!body.trim()) return fail('Geen inhoud gevonden.', 400);
      const did = id('d_');
      db.prepare('INSERT INTO documents (id, user_id, subject_id, title, kind, source_url, text) VALUES (?,?,?,?,?,?,?)').run(
        did, u.id, subjectId, titleOut, kind, url || null, body
      );
      awardXp(u.id, 'document_added');
      return ok({ id: did }, 201);
    }

    const file = form.get('file') as File | null;
    if (!file) return fail('Geen bestand ontvangen.', 400);
    if (file.size > MAX_SIZE) return fail('Bestand is te groot (max 40 MB).', 413);

    const name = file.name;
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const kindMap: Record<string, string> = {
      pdf: 'pdf', docx: 'docx', doc: 'doc', pptx: 'pptx', ppt: 'ppt', txt: 'txt', md: 'md', markdown: 'md',
      csv: 'csv', json: 'text', png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image'
    };
    const kind = kindMap[ext];
    if (!kind) return fail(`Bestandstype .${ext} wordt niet ondersteund.`, 415);

    const buffer = Buffer.from(await file.arrayBuffer());
    if (kind === 'image') {
      // VIN-OCR: opgeslagen, OCR gebeurt in analyse-stap (vision-model)
      const did = id('d_');
      const saved = path.join(UPLOAD_DIR, did + '_' + name.replace(/[^\w.-]/g, '_'));
      fs.writeFileSync(saved, buffer);
      db.prepare('INSERT INTO documents (id, user_id, subject_id, title, kind, storage_path, mime, size, text) VALUES (?,?,?,?,?,?,?,?,?)').run(
        did, u.id, (form.get('subjectId') as string) || null, name.replace(/\.[^.]+$/, ''), 'image', saved, file.type, file.size,
        ''
      );
      awardXp(u.id, 'document_added');
      return ok({ id: did, warning: 'Afbeelding opgeslagen. OCR gebeurt bij de analyse (benodigt AI met beeldondersteuning, of voer tekst handmatig in).' }, 201);
    }

    let extracted: Awaited<ReturnType<typeof extractText>>;
    try {
      extracted = await extractText(kind, buffer);
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Extractie mislukt.', 422);
    }
    if (!extracted.text.trim()) {
      return fail('Kon geen leesbare tekst vinden. Is het bestand een scan? Gebruik dan OCR via een afbeeldingsverwerking.', 422);
    }

    const did = id('d_');
    const saved = path.join(UPLOAD_DIR, did + '_' + name.replace(/[^\w.-]/g, '_'));
    fs.writeFileSync(saved, buffer);
    db.prepare(
      'INSERT INTO documents (id, user_id, subject_id, title, kind, storage_path, mime, size, page_count, text) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).run(
      did, u.id, (form.get('subjectId') as string) || null,
      name.replace(/\.[^.]+$/, ''), kind, saved, file.type || null, file.size, extracted.pages ?? null, extracted.text
    );
    awardXp(u.id, 'document_added');
    return ok({ id: did, pages: extracted.pages, warning: extracted.meta.warning ?? null }, 201);
  });
}
