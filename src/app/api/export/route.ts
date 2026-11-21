import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';

export async function GET(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const kind = new URL(req.url).searchParams.get('kind') || 'full';
    const format = new URL(req.url).searchParams.get('format') || 'json';
    const db = getDb();

    let data: Record<string, unknown> = {};
    if (kind === 'full' || kind === 'progress') {
      data = {
        exportedAt: new Date().toISOString(),
        subjects: db.prepare('SELECT * FROM subjects WHERE user_id = ?').all(u.id),
        chapters: db.prepare('SELECT * FROM chapters WHERE user_id = ?').all(u.id),
        objectives: db.prepare('SELECT id, chapter_id, subject_id, title, description, status, mastery_score, mastery_detail FROM objectives WHERE user_id = ?').all(u.id),
        stats: {
          attempts: db.prepare('SELECT id, quiz_id, mode, score, max_score, percent, duration_s, started_at, finished_at FROM attempts WHERE user_id = ?').all(u.id),
          events: db.prepare('SELECT kind, minutes, xp, at FROM events WHERE user_id = ?').all(u.id)
        }
      };
    }
    if (kind === 'full' || kind === 'flashcards') {
      data.flashcards = db.prepare('SELECT front, back, hint, subject_id, chapter_id, tags FROM flashcards WHERE user_id = ?').all(u.id);
    }
    if (kind === 'full' || kind === 'summaries') {
      data.summaries = db.prepare('SELECT title, kind, content, created_at FROM summaries WHERE user_id = ?').all(u.id);
    }
    if (kind === 'full' || kind === 'quiz') {
      data.quizzes = db.prepare(`SELECT * FROM quizzes WHERE user_id = ?`).all(u.id);
      data.questions = db.prepare(`SELECT prompt, options, answer, points, difficulty, type FROM questions WHERE user_id = ?`).all(u.id);
    }
    if (kind === 'full' || kind === 'plan') {
      data.tasks = db.prepare('SELECT title, minutes, due_date, status, priority FROM plan_tasks WHERE user_id = ?').all(u.id);
      data.calendar = db.prepare('SELECT title, kind, date, time, duration_min FROM calendar_events WHERE user_id = ?').all(u.id);
    }
    if (format === 'csv') {
      const rows = (data.tasks as Record<string, unknown>[]) ?? [];
      const toCsv = (list: Record<string, unknown>[]) => {
        if (!list.length) return '';
        const heads = Object.keys(list[0]);
        return [heads.join(','), ...list.map((r) => heads.map((h) => JSON.stringify(r[h] ?? '')).join(','))].join('\n');
      };
      return ok({ filename: 'studybase-import.csv', csv: toCsv(rows) });
    }
    return ok({ filename: `studybase-${kind}-${new Date().toISOString().slice(0, 10)}.json`, data });
  });
}
