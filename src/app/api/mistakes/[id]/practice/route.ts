import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { generateQuizQuestions } from '@/lib/ai/tasks';
import { isAiConfigured } from '@/lib/ai/client';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const db = getDb();
    const mistake = db.prepare('SELECT id, question_text FROM mistakes WHERE id = ? AND user_id = ?').get(id, u.id) as
      | { id: string; question_text: string } | undefined;
    if (!mistake) return ok({ error: 'Niet gevonden' }, 404);
    if (!isAiConfigured()) return ok({ error: 'AI is niet geconfigureerd (MISTRAL_API_KEY).', configured: false }, 503);
    const questions = await generateQuizQuestions(u.id, {
      subjectName: 'Herhaling',
      chapters: [],
      objectives: [],
      sourceText: `Originele fout: ${mistake.question_text}`,
      count: 3,
      types: ['mc_single', 'fill', 'concept'],
      difficulty: 'medium',
      language: 'nl'
    });
    return ok({ questions });
  });
}
