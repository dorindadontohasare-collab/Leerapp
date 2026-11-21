import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';

export async function GET(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const db = getDb();
    const p = new URL(req.url).searchParams;
    const subjectId = p.get('subjectId');
    const rows = db.prepare(
      `SELECT m.*, s.name subjectName, c.title chapterTitle, o.title objectiveTitle, mp.occurrences patternOccurrences
       FROM mistakes m
       LEFT JOIN subjects s ON s.id = m.subject_id
       LEFT JOIN chapters c ON c.id = m.chapter_id
       LEFT JOIN objectives o ON o.id = m.objective_id
       LEFT JOIN mistakes_patterns mp ON mp.objective_id = m.objective_id AND mp.user_id = m.user_id
       WHERE m.user_id = ? ${subjectId ? 'AND m.subject_id = ?' : ''}
       ORDER BY m.count DESC, m.created_at DESC`
    ).all(...(subjectId ? [u.id, subjectId] : [u.id]));
    const patterns = db.prepare(
      `SELECT mp.*, s.name subjectName, o.title objectiveTitle, o.mastery_score score FROM mistakes_patterns mp
       LEFT JOIN objectives o ON o.id = mp.objective_id LEFT JOIN subjects s ON s.id = o.subject_id
       WHERE mp.user_id = ? AND mp.occurrences >= 2 ORDER BY mp.occurrences DESC LIMIT 20`
    ).all(u.id);
    return ok({ mistakes: rows, patterns });
  });
}
