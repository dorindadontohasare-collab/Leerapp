import { requireUser, isUser, ok, fail, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { analyzeHtml } from '@/lib/appimport';
import fs from 'fs';
import path from 'path';

export const maxDuration = 120;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const db = getDb();
    const app = db.prepare('SELECT id, kind, storage_path, entry_path, url FROM apps WHERE id = ? AND user_id = ?').get(id, u.id) as
      | { id: string; kind: string; storage_path: string | null; entry_path: string | null; url: string | null } | undefined;
    if (!app) return fail('App niet gevonden', 404);

    let analysis: Record<string, unknown>;
    let html = '';
    try {
      if (app.kind === 'url' && app.url) {
        const res = await fetch(app.url, { signal: AbortSignal.timeout(20000), redirect: 'follow' });
        if (!res.ok) return fail(`De app-URL kon niet worden bereikt (${res.status}).`, 502);
        html = await res.text();
      } else if (app.storage_path && app.entry_path) {
        const entry = path.join(app.storage_path, app.entry_path);
        const safe = path.resolve(entry).startsWith(path.resolve(app.storage_path));
        if (!safe || !fs.existsSync(entry)) return fail('Startbestand van de app is niet gevonden.', 404);
        html = fs.readFileSync(entry, 'utf8');
      } else {
        return fail('Deze app bevat geen analyseerbare webcontent.', 400);
      }
      analysis = await analyzeHtml(html);
    } catch {
      return fail('Analyse mislukt: de app kon niet worden ingeladen.', 502);
    }

    const integration = analysis.detectedIntegrations ? 'protocol_supported' : 'open_only';
    db.prepare('UPDATE apps SET analysis = ?, analysis_status = "done", integration = ? WHERE id = ? AND user_id = ?').run(
      JSON.stringify(analysis), integration, id, u.id
    );
    return ok({ analysis, integration });
  });
}
