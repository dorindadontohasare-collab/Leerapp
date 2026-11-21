import { z } from 'zod';
import { requireUser, isUser, ok, fail, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { id as genId } from '@/lib/auth';
import { validateAppMessage } from '@/lib/appprotocol';
import { recordMasteryEvent, recalcMastery } from '@/lib/mastery';
import { awardXp } from '@/lib/gamification';

const schema = z.object({
  entries: z.array(z.record(z.unknown())).max(500)
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const db = getDb();
    const app = db.prepare('SELECT id FROM apps WHERE id = ? AND user_id = ?').get(id, u.id);
    if (!app) return fail('App niet gevonden', 404);
    const rows = db.prepare('SELECT id, payload, source, received_at FROM app_results WHERE app_id = ? AND user_id = ? ORDER BY received_at DESC LIMIT 200').all(id, u.id) as { id: string; payload: string; source: string; received_at: string }[];
    return ok({ results: rows.map((r) => ({ id: r.id, source: r.source, received_at: r.received_at, payload: JSON.parse(r.payload) })) });
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const db = getDb();
    const app = db.prepare('SELECT id, title FROM apps WHERE id = ? AND user_id = ?').get(id, u.id) as
      | { id: string; title: string } | undefined;
    if (!app) return fail('App niet gevonden', 404);

    const body = schema.parse(await req.json());
    const valid: Record<string, unknown>[] = [];
    const rejected: string[] = [];
    for (const entry of body.entries) {
      if (entry.source === 'manual' || entry.type === 'manual_result') {
        valid.push({ ...entry, type: 'result' });
        continue;
      }
      const v = validateAppMessage(entry);
      if (v.valid) valid.push({ ...entry, type: v.type });
      else rejected.push(String(v.reason));
    }

    const ins = db.prepare('INSERT INTO app_results (id, user_id, app_id, payload, source) VALUES (?,?,?,?,?)');
    let mastered = 0;
    for (const entry of valid) {
      ins.run(genId('ar_'), u.id, id, JSON.stringify(entry), entry.source === 'manual_result' ? 'manual' : 'protocol');
      if (entry.type === 'result') {
        const objectiveIds = Array.isArray(entry.objectiveIds) ? (entry.objectiveIds as string[]) : [];
        const correctness = typeof entry.isCorrect === 'boolean'
          ? (entry.isCorrect ? 1 : 0)
          : (typeof entry.score === 'number' ? Math.max(0, Math.min(1, entry.score)) : 0.5);
        for (const oid of objectiveIds.slice(0, 20)) {
          recordMasteryEvent({
            userId: u.id, objectiveId: oid, source: 'app', sourceId: id,
            correctness: correctness as number, difficulty: 2, autonomy: 'independent'
          });
          recalcMastery(u.id, oid);
        }
        mastered += objectiveIds.length;
      }
      if (entry.type === 'summary') {
        const score = typeof entry.score === 'number' ? entry.score : null;
        const maxScore = typeof entry.maxScore === 'number' && entry.maxScore > 0 ? entry.maxScore : null;
        if (score != null && maxScore != null) {
          const percent = Math.round((score / maxScore) * 100);
          awardXp(u.id, 'app_completed', { scaled: percent / 10 });
        }
        db.prepare("UPDATE apps SET last_used_at = datetime('now') WHERE id = ?").run(id);
      }
    }
    if (mastered > 0) db.prepare("UPDATE apps SET last_used_at = datetime('now') WHERE id = ?").run(id);
    return ok({ accepted: valid.length, rejected });
  });
}
