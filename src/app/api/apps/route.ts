import { requireUser, isUser, ok, fail, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { id, hashToken } from '@/lib/auth';
import { analyzeHtml, sanitizeHtmlForSandbox } from '@/lib/appimport';
import { awardXp } from '@/lib/gamification';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const maxDuration = 300;

const APP_DIR = path.join(process.cwd(), 'data', 'apps');

export async function GET() {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const db = getDb();
    const rows = db.prepare(
      `SELECT a.*, s.name subjectName,
        (SELECT COUNT(*) FROM app_results r WHERE r.app_id = a.id) resultCount
       FROM apps a LEFT JOIN subjects s ON s.id = a.subject_id
       WHERE a.user_id = ? ORDER BY a.created_at DESC`
    ).all(u.id);
    return ok({ apps: rows });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const db = getDb();
    const form = await req.formData();
    const mode = String(form.get('mode') || 'file');

    let kind: string;
    let title: string;
    let url: string | null = null;
    let storageDir: string | null = null;
    let entryPath: string | null = null;
    let analysis: Record<string, unknown>;

    if (mode === 'url') {
      url = String(form.get('url') || '');
      if (!/^https:\/\//.test(url)) return fail('Alleen https:// URL\u2019s kunnen veilig worden geopend.', 400);
      title = String(form.get('title') || new URL(url).hostname);
      kind = 'url';
      let html = '';
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'follow' });
        if (!res.ok) return fail(`De app-URL kon niet worden opgehaald (${res.status}).`, 400);
        html = await res.text();
      } catch { return fail('De app-URL kon niet worden bereikt.', 400); }
      const a = await analyzeHtml(html);
      analysis = { ...a, accessedVia: 'url-fetch' };
    } else {
      const file = form.get('file') as File | null;
      if (!file) return fail('Geen bestand ontvangen.', 400);
      title = String(form.get('title') || file.name.replace(/\.[^.]+$/, ''));

      if (file.name.toLowerCase().endsWith('.zip')) {
        kind = 'zip';
        const buffer = Buffer.from(await file.arrayBuffer());
        const JSZip = (await import('jszip')).default;
        let zip: InstanceType<typeof JSZip>;
        try { zip = await JSZip.loadAsync(buffer); } catch { return fail('Ongeldig ZIP-bestand.', 422); }
        const fileNames = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
        if (fileNames.some((n) => n.includes('..') || n.startsWith('/'))) return fail('Veiligheidsprobleem in projectstructuur (pad-traversal).', 400);
        const aid = id('app_');
        const dir = path.join(APP_DIR, aid);
        fs.mkdirSync(dir, { recursive: true });
        let indexHtml: string | null = null;
        for (const n of fileNames.slice(0, 300)) {
          const content = await zip.files[n].async('nodebuffer');
          const out = path.join(dir, n);
          fs.mkdirSync(path.dirname(out), { recursive: true });
          fs.writeFileSync(out, content);
          if (n.endsWith('index.html') || n === 'index.html') indexHtml = n;
          if (!indexHtml && n.endsWith('.html')) indexHtml = indexHtml ?? n;
        }
        if (!indexHtml) return fail('Geen index.html in de ZIP gevonden.', 422);
        storageDir = dir;
        entryPath = indexHtml;
        const html = fs.readFileSync(path.join(dir, indexHtml), 'utf8');
        const a = await analyzeHtml(html);
        analysis = { ...a, files: fileNames.length };
      } else if (file.name.toLowerCase().endsWith('.html') || file.name.toLowerCase().endsWith('.htm')) {
        kind = 'html';
        const html = await file.text();
        const aid = id('app_');
        const dir = path.join(APP_DIR, aid);
        fs.mkdirSync(dir, { recursive: true });
        const sanitize = sanitizeHtmlForSandbox(html);
        fs.writeFileSync(path.join(dir, 'index.html'), sanitize.html);
        storageDir = dir;
        entryPath = 'index.html';
        analysis = { ...(await analyzeHtml(sanitize.html)), sanitized: sanitize.warnings };
      } else if (file.name.toLowerCase().endsWith('.json')) {
        kind = 'json';
        const text = await file.text();
        try { JSON.parse(text); } catch { return fail('Ongeldige JSON-export.', 422); }
        const aid = id('app_');
        const dir = path.join(APP_DIR, aid);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'export.json'), text);
        storageDir = dir;
        entryPath = 'export.json';
        analysis = { title, features: ['JSON-export (inhoud geïmporteerd als data)'], detectedQuizQuestions: (text.match(/question|"vraag"/g) ?? []).length };
      } else {
        return fail('Niet-ondersteund formaat voor app-import. Gebruik .html, .zip of .json.', 415);
      }
    }

    const aid = id('app_');
    const integration = (analysis as { detectedIntegrations?: boolean }).detectedIntegrations ? 'protocol_supported' : 'open_only';
    db.prepare('INSERT INTO apps (id, user_id, subject_id, title, description, kind, storage_path, entry_path, url, integration, analysis) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
      aid, u.id, (form.get('subjectId') as string) || null, title, String(form.get('description') || '') || null,
      kind, storageDir, entryPath, url, integration, JSON.stringify(analysis)
    );

    if (kind !== 'url') {
      const token = crypto.randomBytes(24).toString('hex');
      db.prepare('INSERT INTO app_tokens (id, user_id, app_id, token_hash) VALUES (?,?,?,?)').run(id('tok_'), u.id, aid, hashToken(token));
      awardXp(u.id, 'document_added');
    }
    return ok({ id: aid, integration, analysis }, 201);
  });
}
