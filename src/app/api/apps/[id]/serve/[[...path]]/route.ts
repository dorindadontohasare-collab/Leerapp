import { requireUser, isUser } from '@/lib/api';
import { getDb } from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4'
};

export async function GET(req: Request, ctx: { params: Promise<{ id: string; path?: string[] }> }) {
  const u = await requireUser();
  if (!isUser(u)) return u;
  const { id, path: segments } = await ctx.params;
  const db = getDb();
  const app = db.prepare('SELECT storage_path, entry_path, kind FROM apps WHERE id = ? AND user_id = ?').get(id, u.id) as
    | { storage_path: string; entry_path: string; kind: string } | undefined;
  if (!app || !app.storage_path) return new NextResponse('App niet gevonden', { status: 404 });

  let rel = app.entry_path || 'index.html';
  if (segments && segments.length) rel = segments.join('/');
  const safe = path.normalize(rel).replace(/^(\.\.[\/\\])+/, '');
  const full = path.join(app.storage_path, safe);
  if (!full.startsWith(path.resolve(app.storage_path))) return new NextResponse('Verboden pad', { status: 403 });
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return new NextResponse('Niet gevonden', { status: 404 });

  const data = fs.readFileSync(full);
  const ext = path.extname(full).toLowerCase();
  const html = ext === '.html';
  let body = new Uint8Array(data);
  if (html) {
    let htmlStr = data.toString('utf8');
    // Injecteer integratie-client zodat de app StudyBase-resultaten kan sturen.
    htmlStr = htmlStr.replace(/<\/head>/i, `<script>${fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'integration-client.js'), 'utf8')}</script>`);
    body = new TextEncoder().encode(htmlStr);
  }
  return new NextResponse(body, {
    headers: {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Security-Policy': 'default-src \'self\' data: blob: \'unsafe-inline\'; connect-src \'self\' https:;',
      'X-Frame-Options': 'SAMEORIGIN'
    }
  });
}
