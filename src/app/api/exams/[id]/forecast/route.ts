import { requireUser, isUser, ok, fail, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { examForecast } from '@/lib/ai/tasks';
import { isAiConfigured } from '@/lib/ai/client';

export const maxDuration = 300;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id: examId } = await ctx.params;
    const db = getDb();

    if (!isAiConfigured()) {
      return ok({ error: 'AI is niet geconfigureerd. Voeg MISTRAL_API_KEY toe (zie README).', configured: false }, 503);
    }

    const exam = db.prepare('SELECT e.*, s.name subjectName FROM exams e LEFT JOIN subjects s ON s.id = e.subject_id WHERE e.id = ? AND e.user_id = ?').get(examId, u.id) as
      | { id: string; title: string; exam_date: string; subject_id: string | null; subjectName: string | null } | undefined;
    if (!exam) return fail('Examen niet gevonden', 404);

    const daysLeft = Math.ceil((new Date(exam.exam_date).getTime() - Date.now()) / 86400000);
    const subjectIds: string[] = exam.subject_id
      ? [exam.subject_id]
      : (db.prepare('SELECT id FROM subjects WHERE user_id = ?').all(u.id) as { id: string }[]).map((s) => s.id);

    const subjects = subjectIds.map((sid) => {
      const row = db.prepare('SELECT name FROM subjects WHERE id = ? AND user_id = ?').get(sid, u.id) as { name: string } | undefined;
      const objs = db.prepare('SELECT title, mastery_score FROM objectives WHERE subject_id = ? AND user_id = ?').all(sid, u.id) as { title: string; mastery_score: number }[];
      return {
        name: row?.name ?? exam.subjectName ?? 'Algemeen',
        avgMastery: objs.length ? Math.round(objs.reduce((a, o) => a + o.mastery_score, 0) / objs.length) : 0,
        objectives: objs.map((o) => ({ title: o.title, score: Math.round(o.mastery_score) }))
      };
    });

    const recentAttempts = (db.prepare(
      `SELECT percent, finished_at FROM attempts WHERE user_id = ? AND status = "finished" AND percent IS NOT NULL ORDER BY finished_at DESC LIMIT 20`
    ).all(u.id) as { percent: number; finished_at: string }[]).map((a) => ({ percent: Math.round(a.percent), at: a.finished_at }));

    const forecast = await examForecast(u.id, {
      examTitle: exam.title,
      daysLeft,
      subjects,
      recentAttempts
    });
    return ok({ exam: { id: exam.id, title: exam.title, examDate: exam.exam_date, daysLeft }, forecast, disclaimer: forecast.disclaimer });
  });
}
