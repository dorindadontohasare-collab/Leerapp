import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';

export async function GET(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const db = getDb();
    const subjects = db.prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM chapters c WHERE c.subject_id = s.id) chapterCount,
         (SELECT COUNT(*) FROM objectives o WHERE o.subject_id = s.id) objectiveCount,
         (SELECT COALESCE(ROUND(AVG(mastery_score)),0) FROM objectives o WHERE o.subject_id = s.id) avgMastery,
         (SELECT COUNT(*) FROM documents d WHERE d.subject_id = s.id) documentCount,
         (SELECT COUNT(*) FROM quizzes q WHERE q.subject_id = s.id) quizCount
       FROM subjects s WHERE s.user_id = ? ORDER BY s.name`
    ).all(u.id);
    const chapters = db.prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM objectives o WHERE o.chapter_id = c.id) objectiveCount
       FROM chapters c WHERE c.user_id = ? ORDER BY c.subject_id, c.position`
    ).all(u.id);
    const objectives = db.prepare('SELECT id, chapter_id, subject_id, title, description, status, mastery_score FROM objectives WHERE user_id = ?').all(u.id);
    const notes = db.prepare('SELECT id, subject_id, chapter_id, title, updated_at FROM notes WHERE user_id = ? ORDER BY updated_at DESC').all(u.id);
    return ok({ subjects, chapters, objectives, notes });
  });
}
