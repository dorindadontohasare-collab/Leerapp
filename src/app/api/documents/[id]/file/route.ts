import { requireUser, isUser } from '@/lib/api';
import { getDb } from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (!isUser(u)) return u;
  const { id } = await ctx.params;
  const db = getDb();
  const doc = db.prepare('SELECT storage_path, mime, title, kind FROM documents WHERE id = ? AND user_id = ?').get(id, u.id) as
    | { storage_path: string; mime: string | null; title: string; kind: string }
    | undefined;
  if (!doc?.storage_path || !fs.existsSync(doc.storage_path)) {
    return new NextResponse('Niet gevonden', { status: 404 });
  }
  const data = fs.readFileSync(doc.storage_path);
  const ext = path.extname(doc.storage_path);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': doc.mime || 'application/octet-stream',
      'Content-Disposition': 'inline; filename="' + doc.title.replace(/[^\w.-]/g, '_') + ext + '"'
    }
  });
}
