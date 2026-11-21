import { z } from 'zod';
import { requireUser, isUser, ok, fail, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { id } from '@/lib/auth';
import { awardXp } from '@/lib/gamification';
import { parseTextQuiz, parseJsonQuiz, type ParsedQuestion } from '@/lib/quizimport';

export const maxDuration = 300;

const schema = z.object({
  title: z.string().min(1).max(200),
  subjectId: z.string().nullable().optional(),
  chapterId: z.string().nullable().optional(),
  format: z.enum(['text', 'json']).default('text'),
  content: z.string().min(1).max(2000000)
});

export async function POST(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const body = schema.parse(await req.json());
    const db = getDb();

    const content = body.content;
    const parsed = body.format === 'json'
      ? parseJsonQuiz(content)
      : parseTextQuiz(content);

    if ('error' in parsed) return fail(parsed.error, 422);
    if (!parsed.length) return fail('Er zijn geen vragen herkend. Gebruik een genummerde lijst (1. vraag? a) ... b) ...) plus een antwoordsleutel (Antwoorden: 1. A, 2. C).', 422);

    const qid = id('q_');
    db.prepare('INSERT INTO quizzes (id, user_id, subject_id, title, origin, settings, objective_ids) VALUES (?,?,?,?,?,?,?)').run(
      qid, u.id, body.subjectId ?? null, body.title, 'import',
      JSON.stringify({ importFormat: body.format }), '[]'
    );
    const ins = db.prepare(
      `INSERT INTO questions (id, quiz_id, user_id, subject_id, chapter_id, type, prompt, options, answer, points, difficulty, objective_ids, position)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    parsed.forEach((q, i) => {
      ins.run(id('qst_'), qid, u.id, body.subjectId ?? null, body.chapterId ?? null, q.type, q.prompt,
        JSON.stringify(q.options), JSON.stringify(q.answer), q.points, q.difficulty, '[]', i);
    });
    awardXp(u.id, 'document_analyzed', {});
    return ok({ id: qid, questionCount: parsed.length, needsReview: parsed.filter((q) => q.confidence !== 'parsed').length });
  });
}
