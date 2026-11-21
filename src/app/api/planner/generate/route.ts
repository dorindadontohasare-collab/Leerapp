import { z } from 'zod';
import { requireUser, isUser, ok, handle, fail } from '@/lib/api';
import { getDb } from '@/lib/db';
import { id } from '@/lib/auth';

const schema = z.object({
  days: z.number().int().min(1).max(60).default(14),
  minutesPerDay: z.number().int().min(15).max(600).default(60),
  subjectId: z.string().nullable().optional()
});

/**
 * Heuristische planner: verdeelt beschikbare tijd over leerdoelen op basis van
 * beheersing (zwak eerst) en aankomende examens. Werkt zonder AI-sleutel.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const body = schema.parse(await req.json());
    const db = getDb();

    const objectives = db.prepare(
      `SELECT o.id, o.title, o.mastery_score, o.subject_id, s.name subjectName FROM objectives o JOIN subjects s ON s.id = o.subject_id
       WHERE o.user_id = ? AND o.status NOT IN ('mastered') ${body.subjectId ? 'AND o.subject_id = ?' : ''}
       ORDER BY o.mastery_score ASC`
    ).all(...(body.subjectId ? [u.id, body.subjectId] : [u.id])) as { id: string; title: string; mastery_score: number; subject_id: string; subjectName: string }[];
    if (!objectives.length) return fail('Er zijn geen open leerdoelen om te plannen.', 400);

    const exams = db.prepare(`SELECT title, exam_date, subject_id FROM exams WHERE user_id = ? AND date(exam_date) >= date('now') ORDER BY exam_date ASC`).all(u.id) as { title: string; exam_date: string; subject_id: string | null }[];
    const examBySubject = new Map(exams.filter((e) => e.subject_id).map((e) => [e.subject_id as string, e.exam_date]));

    const tasks: { objectiveId: string; subjectId: string; title: string; minutes: number; dueDate: string; priority: string }[] = [];
    let idx = 0;
    const start = new Date();
    const totalObjectives = objectives.length;
    const daysNeeded = Math.max(body.days, Math.ceil(totalObjectives / Math.max(1, Math.floor(body.minutesPerDay / 30))));

    const subjectGroups = new Map<string, typeof objectives>();
    for (const o of objectives) {
      const arr = subjectGroups.get(o.subject_id) ?? [];
      arr.push(o);
      subjectGroups.set(o.subject_id, arr);
    }

    const dayCursor = new Date(start);
    let d = 0;
    while (d < daysNeeded && idx < totalObjectives) {
      const dateStr = dayCursor.toISOString().slice(0, 10);
      let remaining = body.minutesPerDay;
      while (remaining >= 20 && idx < totalObjectives) {
        const o = objectives[idx];
        const examDate = examBySubject.get(o.subject_id);
        const daysToExam = examDate ? Math.ceil((new Date(examDate).getTime() - Date.now()) / 86400000) : null;
        const priority = o.mastery_score < 40 || (daysToExam != null && daysToExam <= 7) ? 'high' : o.mastery_score < 70 ? 'normal' : 'low';
        const minutes = Math.min(remaining, o.mastery_score < 40 ? 45 : 30);
        tasks.push({ objectiveId: o.id, subjectId: o.subject_id, title: `Oefen: ${o.title} (${o.subjectName})`, minutes, dueDate: dateStr, priority });
        idx++;
        remaining -= minutes;
      }
      dayCursor.setDate(dayCursor.getDate() + 1);
      d++;
    }

    for (const t of tasks) {
      db.prepare(`INSERT INTO plan_tasks (id, user_id, subject_id, objective_id, title, minutes, due_date, priority, generated_by) VALUES (?,?,?,?,?,?,?,?,'ai')`).run(
        id('t_'), u.id, t.subjectId, t.objectiveId, t.title, t.minutes, t.dueDate, t.priority
      );
    }
    return ok({ created: tasks.length });
  });
}
