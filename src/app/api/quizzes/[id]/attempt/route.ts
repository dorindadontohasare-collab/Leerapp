import { z } from 'zod';
import { requireUser, isUser, ok, fail, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { id as genId } from '@/lib/auth';

const schema = z.object({
  mode: z.enum(['practice', 'exam', 'speed', 'survival', 'weak', 'mastery']).default('practice'),
  shuffle: z.boolean().default(true),
  timeLimitMin: z.number().int().nullable().optional(),
  feedbackMode: z.enum(['immediate', 'end']).default('immediate')
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());
    const db = getDb();

    const quiz = db.prepare('SELECT id, title FROM quizzes WHERE id = ? AND user_id = ?').get(id, u.id) as
      | { id: string; title: string } | undefined;
    if (!quiz) return fail('Quiz niet gevonden.', 404);

    const existing = db.prepare(
      `SELECT id FROM attempts WHERE quiz_id = ? AND user_id = ? AND status = 'in_progress'`
    ).get(id, u.id) as { id: string } | undefined;
    if (existing) return ok({ attemptId: existing.id, resumed: true });

    let order = (db.prepare('SELECT id, difficulty FROM questions WHERE quiz_id = ? ORDER BY position').all(id) as { id: string; difficulty: number }[]);
    if (body.mode === 'survival') order.sort((a, b) => a.difficulty - b.difficulty);
    else if (body.shuffle) order.sort(() => Math.random() - 0.5);

    const aid = genId('a_');
    db.prepare('INSERT INTO attempts (id, quiz_id, user_id, mode, status, snapshot) VALUES (?,?,?,?,?,?)').run(
      aid, id, u.id, body.mode, 'in_progress',
      JSON.stringify({ order: order.map((o) => o.id), ...body })
    );
    return ok({ attemptId: aid, resumed: false }, 201);
  });
}
