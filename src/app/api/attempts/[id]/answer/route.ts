import { z } from 'zod';
import { requireUser, isUser, ok, fail, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { id as genId } from '@/lib/auth';
import { gradeObjective, isAiOpenType, convertAiGrading } from '@/lib/grading';
import { gradeOpenAnswer } from '@/lib/ai/tasks';
import { isAiConfigured } from '@/lib/ai/client';

const schema = z.object({
  questionId: z.string(),
  answer: z.record(z.unknown()),
  timeMs: z.number().optional()
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());
    const db = getDb();

    const attempt = db.prepare(`SELECT id, mode FROM attempts WHERE id = ? AND user_id = ? AND status = 'in_progress'`).get(id, u.id) as
      | { id: string; mode: string } | undefined;
    if (!attempt) return fail('Poging niet gevonden of al afgerond.', 404);

    const question = db.prepare('SELECT id, type, prompt, options, answer, points, difficulty, explanation, objective_ids FROM questions WHERE id = ? AND quiz_id = (SELECT quiz_id FROM attempts WHERE id = ?)').get(body.questionId, id) as
      | Record<string, unknown> | undefined;
    if (!question) return fail('Vraag niet gevonden.', 404);

    let graded;
    const parsedAnswer = (typeof question.answer === 'string'
      ? JSON.parse(question.answer)
      : question.answer) as Record<string, unknown>;
    if (isAiOpenType(question.type as string)) {
      const answerObj = parsedAnswer;
      if (isAiConfigured() && answerObj.modelAnswer) {
        const settings = (db.prepare('SELECT settings FROM users WHERE id = ?').get(u.id) as { settings: string }).settings;
        const aiModel = (JSON.parse(settings) as { aiModel?: string }).aiModel;
        try {
          const ai = await gradeOpenAnswer(u.id, {
            prompt: question.prompt as string,
            type: question.type as never,
            modelAnswer: String(answerObj.modelAnswer ?? ''),
            keywords: (answerObj.keywords as string[]) ?? [],
            points: (answerObj.points as { part: string; points: number }[]) ?? [],
            maxPoints: question.points as number,
            studentAnswer: String((body.answer as { text?: string }).text ?? ''),
            difficulty: question.difficulty as number
          }, aiModel);
          graded = convertAiGrading(question.points as number, ai);
        } catch (err) {
          return ok({ error: err instanceof Error ? err.message : 'AI-correctie mislukt', degraded: true }, 502);
        }
      } else {
        graded = gradeObjective({ ...(question as object), answer: parsedAnswer } as never, body.answer);
      }
    } else {
      graded = gradeObjective({ ...(question as object), answer: parsedAnswer } as never, body.answer);
    }

    const existing = db.prepare('SELECT id FROM attempt_answers WHERE attempt_id = ? AND question_id = ?').get(id, body.questionId) as { id: string } | undefined;
    if (existing) {
      db.prepare('UPDATE attempt_answers SET answer = ?, graded = ?, ai_graded = ?, time_ms = ? WHERE id = ?').run(
        JSON.stringify(body.answer), JSON.stringify(graded), graded.gradedBy === 'ai' ? 1 : 0, body.timeMs ?? null, existing.id
      );
    } else {
      db.prepare('INSERT INTO attempt_answers (id, attempt_id, user_id, question_id, answer, graded, ai_graded, time_ms) VALUES (?,?,?,?,?,?,?,?)').run(
        genId('aa_'), id, u.id, body.questionId, JSON.stringify(body.answer), JSON.stringify(graded), graded.gradedBy === 'ai' ? 1 : 0, body.timeMs ?? null
      );
    }
    return ok({ graded });
  });
}
