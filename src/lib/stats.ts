import { getDb } from './db';

export function getStats(userId: string, days?: number, subjectId?: string) {
  const db = getDb();
  const from = days ? new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ') : null;

  /* Proberen hebben geen eigen subject-kolom: via quizzes gekoppeld. */
  const attemptSubFrom = `FROM attempts a JOIN quizzes qz ON qz.id = a.quiz_id WHERE a.user_id = s.user_id AND qz.subject_id = s.id AND a.status = 'finished' ${from ? 'AND a.finished_at >= ?' : ''}`;
  const attemptFilter = from ? 'AND a.finished_at >= ?' : '';
  const eventFilter = from ? 'AND e.at >= ?' : '';

  const totals = db.prepare(
    `SELECT COUNT(*) quizCount, COALESCE(AVG(a.percent),0) avgPercent FROM attempts a
     JOIN quizzes q ON q.id = a.quiz_id
     WHERE a.user_id = ? AND a.status = 'finished' ${attemptFilter} ${subjectId ? 'AND q.subject_id = ?' : ''}`
  ).get(...[userId, ...(from ? [from] : []), ...(subjectId ? [subjectId] : [])]) as { quizCount: number; avgPercent: number };

  const minutes = db.prepare(
    `SELECT COALESCE(SUM(minutes),0) total FROM events e WHERE e.user_id = ? ${eventFilter} ${subjectId ? 'AND e.subject_id = ?' : ''}`
  ).get(...[userId, ...(from ? [from] : []), ...(subjectId ? [subjectId] : [])]) as { total: number };

  const today = new Date().toISOString().slice(0, 10);
  const minutesToday = db.prepare(
    'SELECT COALESCE(SUM(minutes),0) total FROM events e WHERE e.user_id = ? AND date(e.at) = ?'
  ).get(userId, today) as { total: number };

  const objectives = db.prepare(
    `SELECT COUNT(*) total,
       SUM(CASE WHEN status = 'mastered' THEN 1 ELSE 0 END) mastered,
       SUM(CASE WHEN status IN ('new','weak','in_progress') THEN 1 ELSE 0 END) attention
     FROM objectives o WHERE o.user_id = ? ${subjectId ? 'AND o.subject_id = ?' : ''}`
  ).get(...[userId, ...(subjectId ? [subjectId] : [])]) as { total: number; mastered: number | null; attention: number | null };

  const bySubject = db.prepare(
    `SELECT s.id, s.name, s.color,
       (SELECT COUNT(*) ${attemptSubFrom}) quizCount,
       (SELECT COALESCE(AVG(a.percent),0) ${attemptSubFrom}) avgPercent,
       (SELECT COALESCE(AVG(mastery_score),0) FROM objectives o WHERE o.user_id = s.user_id AND o.subject_id = s.id) avgMastery,
       (SELECT COALESCE(SUM(minutes),0) FROM events e WHERE e.user_id = s.user_id AND e.subject_id = s.id ${eventFilter}) minutes
     FROM subjects s WHERE s.user_id = ? ${subjectId ? 'AND s.id = ?' : ''}
     ORDER BY s.name`
  ).all(...(from ? [from, from, from] : []), userId, ...(subjectId ? [subjectId] : [])) as {
    id: string; name: string; color: string; quizCount: number; avgPercent: number; avgMastery: number; minutes: number;
  }[];

  const timeline = db.prepare(
    `SELECT date(at) day, SUM(minutes) minutes, SUM(xp) xp FROM events e WHERE e.user_id = ? ${eventFilter} GROUP BY day ORDER BY day DESC LIMIT 180`
  ).all(userId, ...(from ? [from] : [])).reverse() as { day: string; minutes: number; xp: number }[];

  const attemptScores = db.prepare(
    `SELECT a.id, a.percent, a.mode, a.finished_at at, q.title FROM attempts a JOIN quizzes q ON q.id = a.quiz_id
     WHERE a.user_id = ? AND a.status = 'finished' ${attemptFilter} ${subjectId ? 'AND q.subject_id = ?' : ''}
     ORDER BY a.finished_at DESC LIMIT 200`
  ).all(userId, ...(from ? [from] : []), ...(subjectId ? [subjectId] : [])) as { id: string; percent: number; mode: string; at: string; title: string }[];

  const mistakeCount = db.prepare(
    `SELECT COUNT(*) c FROM mistakes m WHERE m.user_id = ? ${from ? `AND m.created_at >= ?` : ''} ${subjectId ? 'AND m.subject_id = ?' : ''}`
  ).get(...[userId, ...(from ? [from] : []), ...(subjectId ? [subjectId] : [])]) as { c: number };

  const flashcards = db.prepare(
    `SELECT COUNT(*) total, SUM(CASE WHEN cs.due_at <= datetime('now') THEN 1 ELSE 0 END) due
     FROM flashcards f LEFT JOIN card_state cs ON cs.user_id = f.user_id AND cs.card_id = f.id
     WHERE f.user_id = ? ${subjectId ? 'AND f.subject_id = ?' : ''}`
  ).get(...[userId, ...(subjectId ? [subjectId] : [])]) as { total: number; due: number | null };

  const weakest = db.prepare(
    `SELECT o.id, o.title title, o.mastery_score score, s.name subject FROM objectives o JOIN subjects s ON s.id = o.subject_id
     WHERE o.user_id = ? AND o.status IN ('new','weak','in_progress') ${subjectId ? 'AND o.subject_id = ?' : ''}
     ORDER BY o.mastery_score ASC LIMIT 10`
  ).all(userId, ...(subjectId ? [subjectId] : [])) as { id: string; title: string; score: number; subject: string }[];

  const strongest = db.prepare(
    `SELECT o.id, o.title title, o.mastery_score score, s.name subject FROM objectives o JOIN subjects s ON s.id = o.subject_id
     WHERE o.user_id = ? AND o.mastery_score >= 70 ${subjectId ? 'AND o.subject_id = ?' : ''}
     ORDER BY o.mastery_score DESC LIMIT 10`
  ).all(userId, ...(subjectId ? [subjectId] : [])) as { id: string; title: string; score: number; subject: string }[];

  const byChapter = db.prepare(
    `SELECT c.id, c.title title, s.name subject, COALESCE(AVG(o.mastery_score),0) avgMastery, COUNT(o.id) objectives FROM chapters c
     JOIN subjects s ON s.id = c.subject_id LEFT JOIN objectives o ON o.chapter_id = c.id
     WHERE c.user_id = ? ${subjectId ? 'AND c.subject_id = ?' : ''} GROUP BY c.id ORDER BY c.position`
  ).all(userId, ...(subjectId ? [subjectId] : [])) as { id: string; title: string; subject: string; avgMastery: number; objectives: number }[];

  return {
    totals,
    minutes,
    minutesToday: minutesToday.total,
    objectives,
    bySubject,
    timeline,
    attemptScores,
    mistakeCount,
    flashcards,
    weakest,
    strongest,
    byChapter
  };
}

export function getDashboardExtras(userId: string) {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const goal = (db.prepare('SELECT daily_goal_minutes FROM users WHERE id = ?').get(userId) as { daily_goal_minutes: number } | undefined)?.daily_goal_minutes ?? 45;
  const minutesToday = (db.prepare('SELECT COALESCE(SUM(minutes),0) t FROM events WHERE user_id = ? AND date(at) = ?').get(userId, today) as { t: number }).t;
  const openTasks = (db.prepare("SELECT COUNT(*) c FROM plan_tasks WHERE user_id = ? AND status = 'open'").get(userId) as { c: number }).c;
  const dueCards = (db.prepare(
    `SELECT COUNT(*) c FROM flashcards f LEFT JOIN card_state cs ON cs.user_id = f.user_id AND cs.card_id = f.id
     WHERE f.user_id = ? AND cs.due_at <= datetime('now')`
  ).get(userId) as { c: number }).c;
  const nextExam = db.prepare(`SELECT id, title, exam_date, CAST(julianday(exam_date) - julianday('now') AS INT) daysLeft FROM exams WHERE user_id = ? AND exam_date >= ? ORDER BY exam_date ASC LIMIT 1`).get(userId, today) as { id: string; title: string; exam_date: string; daysLeft: number } | undefined;
  const streak = (db.prepare('SELECT streak_count s FROM users WHERE id = ?').get(userId) as { s: number }).s;
  return { minutesToday, goalPercent: Math.round((minutesToday / Math.max(1, goal)) * 100), openTasks, dueCards, nextExam: nextExam ?? null, streak };
}
