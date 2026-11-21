import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import fs from 'fs';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const db = getDb();
    const doc = db.prepare(
      `SELECT d.*, s.name subjectName, c.title chapterTitle FROM documents d
       LEFT JOIN subjects s ON s.id = d.subject_id LEFT JOIN chapters c ON c.id = d.chapter_id
       WHERE d.id = ? AND d.user_id = ?`
    ).get(id, u.id) as Record<string, unknown> | undefined;
    if (!doc) return ok({ error: 'Niet gevonden' }, 404);
    const summaries = db.prepare('SELECT id, kind, title, content, origin, source_refs, created_at FROM summaries WHERE document_id = ? ORDER BY created_at DESC').all(id);
    return ok({ document: doc, summaries, analysis: doc.analysis ? JSON.parse(doc.analysis as string) : null });
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const body = (await req.json()) as { title?: string; subjectId?: string | null; text?: string };
    const db = getDb();
    if (body.title) db.prepare('UPDATE documents SET title = ? WHERE id = ? AND user_id = ?').run(body.title.slice(0, 200), id, u.id);
    if (body.subjectId !== undefined) db.prepare('UPDATE documents SET subject_id = ? WHERE id = ? AND user_id = ?').run(body.subjectId, id, u.id);
    if (body.text) db.prepare('UPDATE documents SET text = ? WHERE id = ? AND user_id = ?').run(String(body.text).slice(0, 500000), id, u.id);
    return ok({ ok: true });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const db = getDb();
    const doc = db.prepare('SELECT storage_path FROM documents WHERE id = ? AND user_id = ?').get(id, u.id) as { storage_path?: string } | undefined;
    db.prepare('DELETE FROM documents WHERE id = ? AND user_id = ?').run(id, u.id);
    if (doc?.storage_path && fs.existsSync(doc.storage_path)) fs.unlinkSync(doc.storage_path);
    return ok({ ok: true });
  });
}
