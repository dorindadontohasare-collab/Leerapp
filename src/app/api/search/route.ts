import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';

export async function GET(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const q = (new URL(req.url).searchParams.get('q') || '').trim();
    if (!q) return ok({ results: [] });
    const db = getDb();
    const like = `%${q}%`;
    const results = [
      ...db.prepare(`SELECT 'subject' type, id, name title, 'Vak' subtitle FROM subjects WHERE user_id = ? AND name LIKE ? LIMIT 5`).all(u.id, like),
      ...db.prepare(`SELECT 'chapter' type, c.id, c.title, c2.name subtitle FROM chapters c JOIN subjects c2 ON c2.id = c.subject_id WHERE c.user_id = ? AND c.title LIKE ? LIMIT 5`).all(u.id, like),
      ...db.prepare(`SELECT 'objective' type, o.id, o.title, c.title subtitle FROM objectives o JOIN chapters c ON c.id = o.chapter_id WHERE o.user_id = ? AND o.title LIKE ? LIMIT 8`).all(u.id, like),
      ...db.prepare(`SELECT 'document' type, d.id, d.title, c.title subtitle FROM documents d LEFT JOIN chapters c ON c.id = d.chapter_id WHERE d.user_id = ? AND d.title LIKE ? LIMIT 5`).all(u.id, like),
      ...db.prepare(`SELECT 'quiz' type, q.id, q.title, s.name subtitle FROM quizzes q LEFT JOIN subjects s ON s.id = q.subject_id WHERE q.user_id = ? AND q.title LIKE ? LIMIT 5`).all(u.id, like),
      ...db.prepare(`SELECT 'app' type, a.id, a.title, 'Geïmporteerde app' subtitle FROM apps a WHERE a.user_id = ? AND a.title LIKE ? LIMIT 5`).all(u.id, like),
      ...db.prepare(`SELECT 'card' type, f.id, f.front title, 'Flashcard' subtitle FROM flashcards f WHERE f.user_id = ? AND f.front LIKE ? LIMIT 5`).all(u.id, like),
      ...db.prepare(`SELECT 'mistake' type, m.id, substr(m.question_text, 1, 80) title, 'Fout' subtitle FROM mistakes m WHERE m.user_id = ? AND m.question_text LIKE ? LIMIT 5`).all(u.id, like),
      ...db.prepare(`SELECT 'summary' type, su.id, su.title, 'Samenvatting' subtitle FROM summaries su WHERE su.user_id = ? AND su.content LIKE ? LIMIT 5`).all(u.id, like)
    ];
    return ok({ results });
  });
}
