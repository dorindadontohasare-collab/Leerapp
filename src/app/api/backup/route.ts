import { requireUser, isUser, ok, fail, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { id } from '@/lib/auth';

export async function GET() {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const db = getDb();
    const dump: Record<string, unknown[]> = {};
    for (const table of ['subjects', 'chapters', 'objectives', 'documents', 'summaries', 'quizzes', 'questions', 'flashcards', 'card_state', 'plan_tasks', 'calendar_events', 'exams', 'apps', 'mistakes', 'events', 'notes']) {
      dump[table] = db.prepare(`SELECT * FROM ${table} WHERE user_id = ?`).all(u.id);
    }
    const user = db.prepare('SELECT id, email, name, settings, xp, daily_goal_minutes FROM users WHERE id = ?').get(u.id);
    const attemptData = db.prepare('SELECT * FROM attempts WHERE user_id = ?').all(u.id);
    return ok({ version: 1, exportedAt: new Date().toISOString(), user, data: dump, attempts: attemptData });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const body = (await req.json()) as { backup: { data: Record<string, Record<string, unknown>[]> } };
    if (!body.backup?.data) return fail('Ongeldig back-upbestand.', 422);
    const db = getDb();

    const map = new Map<string, string>();
    const txn = db.transaction(() => {
      if (Array.isArray(body.backup.data.subjects)) {
        for (const row of body.backup.data.subjects) {
          const newId = id('s_');
          map.set(String(row.id), newId);
          db.prepare('INSERT INTO subjects (id, user_id, name, color, icon, description) VALUES (?,?,?,?,?,?)').run(
            newId, u.id, String(row.name), String(row.color ?? '#A9C9ED'), String(row.icon ?? 'book'), row.description ? String(row.description) : null
          );
        }
      }
      if (Array.isArray(body.backup.data.chapters)) {
        for (const row of body.backup.data.chapters) {
          const newId = id('c_');
          map.set(String(row.id), newId);
          db.prepare('INSERT INTO chapters (id, user_id, subject_id, title, summary, position) VALUES (?,?,?,?,?,?)').run(
            newId, u.id, map.get(String(row.subject_id)) ?? null, String(row.title), row.summary ? String(row.summary) : null, Number(row.position ?? 0)
          );
        }
      }
      if (Array.isArray(body.backup.data.objectives)) {
        for (const row of body.backup.data.objectives) {
          const newId = id('o_');
          map.set(String(row.id), newId);
          db.prepare('INSERT INTO objectives (id, user_id, subject_id, chapter_id, title, description, position, status, mastery_score) VALUES (?,?,?,?,?,?,?,?,?)').run(
            newId, u.id,
            map.get(String(row.subject_id)),
            map.get(String(row.chapter_id)),
            String(row.title), row.description ? String(row.description) : null, Number(row.position ?? 0), String(row.status ?? 'new'), Number(row.mastery_score ?? 0)
          );
        }
      }
      if (Array.isArray(body.backup.data.flashcards)) {
        for (const row of body.backup.data.flashcards) {
          db.prepare('INSERT INTO flashcards (id, user_id, subject_id, chapter_id, front, back, hint) VALUES (?,?,?,?,?,?,?)').run(
            id('f_'), u.id,
            map.get(String(row.subject_id)) ?? null,
            map.get(String(row.chapter_id)) ?? null,
            String(row.front), String(row.back), row.hint ? String(row.hint) : null
          );
        }
      }
      if (Array.isArray(body.backup.data.plan_tasks)) {
        for (const row of body.backup.data.plan_tasks) {
          db.prepare('INSERT INTO plan_tasks (id, user_id, subject_id, title, minutes, due_date, status, priority) VALUES (?,?,?,?,?,?,?,?)').run(
            id('t_'), u.id, map.get(String(row.subject_id)) ?? null, String(row.title), Number(row.minutes ?? 30),
            row.due_date ? String(row.due_date) : null, String(row.status ?? 'open'), String(row.priority ?? 'normal')
          );
        }
      }
    });
    txn();
    return ok({ restored: true });
  });
}
