import { z } from 'zod';
import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import fs from 'fs';

const patch = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  subjectId: z.string().nullable().optional(),
  folder: z.string().max(80).optional(),
  icon: z.string().max(40).optional()
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const db = getDb();
    const app = db.prepare(
      `SELECT a.*, s.name subjectName FROM apps a LEFT JOIN subjects s ON s.id = a.subject_id WHERE a.id = ? AND a.user_id = ?`
    ).get(id, u.id) as Record<string, unknown> | undefined;
    if (!app) return ok({ error: 'Niet gevonden' }, 404);
    const results = db.prepare('SELECT id, payload, source, received_at FROM app_results WHERE app_id = ? ORDER BY received_at DESC LIMIT 50').all(id) as { id: string; payload: string; source: string; received_at: string }[];
    return ok({
      app: { ...app, analysis: app.analysis ? JSON.parse(app.analysis as string) : null },
      results: results.map((r) => ({ id: r.id, source: r.source, received_at: r.received_at, payload: JSON.parse(r.payload) }))
    });
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const body = patch.parse(await req.json());
    const db = getDb();
    const fields = Object.keys(body);
    if (fields.length) {
      const set = fields.map((f) => `${f} = ?`).join(', ');
      db.prepare(`UPDATE apps SET ${set} WHERE id = ? AND user_id = ?`).run(
        ...fields.map((f) => (body as Record<string, unknown>)[f] ?? null), id, u.id
      );
    }
    return ok({ ok: true });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const db = getDb();
    const app = db.prepare('SELECT storage_path FROM apps WHERE id = ? AND user_id = ?').get(id, u.id) as { storage_path: string | null } | undefined;
    db.prepare('DELETE FROM apps WHERE id = ? AND user_id = ?').run(id, u.id);
    if (app?.storage_path && fs.existsSync(app.storage_path)) fs.rmSync(app.storage_path, { recursive: true, force: true });
    return ok({ ok: true });
  });
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const db = getDb();
    const app = db.prepare('SELECT title, description, subject_id, kind, analysis, url FROM apps WHERE id = ? AND user_id = ?').get(id, u.id) as Record<string, unknown> | undefined;
    if (!app) return ok({ error: 'Niet gevonden' }, 404);
    const newId = 'app_' + id.slice(4);
    db.prepare('INSERT INTO apps (id, user_id, subject_id, title, description, kind, storage_path, entry_path, url, folder, analysis) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
      newId, u.id, app.subject_id as string, (app.title as string) + ' (kopie)', app.description as string, app.kind as string,
      app.storage_path as string, app.entry_path as string, app.url as string, '', app.analysis as string
    );
    return ok({ id: newId }, 201);
  });
}
