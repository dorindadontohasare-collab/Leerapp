import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { id as genId } from '@/lib/auth';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const body = (await req.json()) as { action?: 'save_as_card' | 'linked' };
    const db = getDb();
    const m = db.prepare('SELECT id, question_text, correct_answer FROM mistakes WHERE id = ? AND user_id = ?').get(id, u.id) as
      | { id: string; question_text: string; correct_answer: string | null } | undefined;
    if (!m) return ok({ error: 'Niet gevonden' }, 404);
    if (body.action === 'save_as_card') {
      const fid = genId('f_');
      db.prepare('INSERT INTO flashcards (id, user_id, front, back, origin) VALUES (?,?,?,?,?)').run(
        fid, u.id, m.question_text, m.correct_answer ?? 'Onbekend antwoord', 'manual'
      );
      db.prepare('UPDATE mistakes SET card_id = ? WHERE id = ? AND user_id = ?').run(fid, id, u.id);
      return ok({ savedAsCard: fid });
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
    db.prepare('DELETE FROM mistakes WHERE id = ? AND user_id = ?').run(id, u.id);
    return ok({ ok: true });
  });
}
