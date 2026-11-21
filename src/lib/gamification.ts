import { getDb } from './db';
import { id } from './auth';

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const XP_TABLE: Record<string, number> = {
  quiz_question_answered: 2,
  quiz_completed: 0,
  flashcard_review: 1,
  document_added: 10,
  document_analyzed: 15,
  focus_done: 20,
  oral_practice: 10,
  app_used: 3,
  app_completed: 0,
  objective_mastered: 100,
  plan_task_done: 15,
  exam_mock: 30
};

export function awardXp(userId: string, kind: keyof typeof XP_TABLE, extras: { minutes?: number; scaled?: number } = {}): number {
  let xp = XP_TABLE[kind] ?? 0;
  if (kind === 'quiz_completed' && extras.scaled != null) xp = Math.round(extras.scaled);
  const db = getDb();
  db.prepare("INSERT INTO events (id, user_id, kind, minutes, xp, at) VALUES (?,?,?,?,?,datetime('now'))").run(
    id('ev_'), userId, kind, extras.minutes ?? 0, xp
  );
  db.prepare('UPDATE users SET xp = xp + ? WHERE id = ?').run(xp, userId);
  updateStreak(userId);
  checkBadges(userId);
  return xp;
}

export function levelForXp(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let remaining = xp;
  let need = 100;
  while (remaining >= need) {
    remaining -= need;
    level += 1;
    need = Math.round(need * 1.25);
  }
  return { level, into: remaining, need };
}

export interface BadgeStats {
  streak: number; quizCount: number; mastered: number; cardReviews: number; focusSessions: number; improvedWeak: number; docCount: number;
}

export const BADGE_DEFS: { code: string; name: string; description: string; test: (s: BadgeStats) => boolean }[] = [
  { code: 'first_quiz', name: 'Eerste quiz', description: 'Voltooi je eerste quiz.', test: (s) => s.quizCount >= 1 },
  { code: 'ten_quizzes', name: 'Doorzetter', description: 'Voltooi 10 quizzen.', test: (s) => s.quizCount >= 10 },
  { code: 'streak_3', name: '3-daagse streak', description: 'Studeer 3 dagen op rij.', test: (s) => s.streak >= 3 },
  { code: 'streak_7', name: 'Week van discipline', description: 'Studeer 7 dagen op rij.', test: (s) => s.streak >= 7 },
  { code: 'first_mastered', name: 'Beheersing', description: 'Beheersteer je eerste leerdoel.', test: (s) => s.mastered >= 1 },
  { code: 'ten_mastered', name: 'Meester', description: 'Beheersteer 10 leerdoelen.', test: (s) => s.mastered >= 10 },
  { code: 'cards_50', name: 'Kaartenwizer', description: 'Herhaal 50 flashcards.', test: (s) => s.cardReviews >= 50 },
  { code: 'focus_5', name: 'Diepe focus', description: 'Voltooi 5 focus-sessies.', test: (s) => s.focusSessions >= 5 },
  { code: 'improved_weak', name: 'Omslag', description: 'Werk een zwak leerdoel af naar bijna beheerst.', test: (s) => s.improvedWeak >= 1 },
  { code: 'doc_5', name: 'Bronmeester', description: 'Voeg 5 documenten toe.', test: (s) => s.docCount >= 5 }
];

function badgeStats(userId: string): BadgeStats {
  const db = getDb();
  const user = db.prepare('SELECT streak_count FROM users WHERE id = ?').get(userId) as { streak_count: number };
  const quizCount = (db.prepare("SELECT COUNT(*) c FROM attempts WHERE user_id = ? AND status = 'finished'").get(userId) as { c: number }).c;
  const mastered = (db.prepare("SELECT COUNT(*) c FROM objectives WHERE user_id = ? AND status = 'mastered'").get(userId) as { c: number }).c;
  const cardReviews = (db.prepare("SELECT COUNT(*) c FROM events WHERE user_id = ? AND kind = 'flashcard_review'").get(userId) as { c: number }).c;
  const focusSessions = (db.prepare("SELECT COUNT(*) c FROM events WHERE user_id = ? AND kind = 'focus_done'").get(userId) as { c: number }).c;
  const improvedWeak = (db.prepare("SELECT COUNT(DISTINCT objective_id) c FROM mistakes_patterns WHERE user_id = ?").get(userId) as { c: number }).c;
  const docCount = (db.prepare('SELECT COUNT(*) c FROM documents WHERE user_id = ?').get(userId) as { c: number }).c;
  return { streak: user.streak_count, quizCount, mastered, cardReviews, focusSessions, improvedWeak, docCount };
}

export function updateStreak(userId: string): void {
  const db = getDb();
  const user = db.prepare('SELECT streak_count, streak_last_date FROM users WHERE id = ?').get(userId) as { streak_count: number; streak_last_date: string | null };
  const t = today();
  if (user.streak_last_date === t) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const next = user.streak_last_date === yesterday ? user.streak_count + 1 : 1;
  db.prepare('UPDATE users SET streak_count = ?, streak_last_date = ? WHERE id = ?').run(next, t, userId);
}

export function checkBadges(userId: string): string[] {
  const db = getDb();
  const stats = badgeStats(userId);
  const owned = new Set((db.prepare('SELECT code FROM badges WHERE user_id = ?').all(userId) as { code: string }[]).map((b) => b.code));
  const newly: string[] = [];
  for (const def of BADGE_DEFS) {
    if (!owned.has(def.code) && def.test(stats)) {
      db.prepare('INSERT OR IGNORE INTO badges (user_id, code) VALUES (?,?)').run(userId, def.code);
      newly.push(def.code);
    }
  }
  return newly;
}
