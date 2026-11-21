import { z } from 'zod';
import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { coachChat, dailyRecommendations, type CoachContext } from '@/lib/ai/tasks';
import { isAiConfigured } from '@/lib/ai/client';

const schema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('chat'),
    message: z.string().min(1).max(8000),
    history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })).max(20).default([]),
    subjectId: z.string().nullable().optional(),
    chapterId: z.string().nullable().optional(),
    documentId: z.string().nullable().optional()
  }),
  z.object({ kind: z.literal('recommendations') })
]);

function buildContext(userId: string, subjectId?: string | null, chapterId?: string | null, documentId?: string | null): CoachContext {
  const db = getDb();
  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as { name: string };
  const objectives = (subjectId
    ? db.prepare('SELECT o.title, o.status, o.mastery_score score FROM objectives o WHERE o.user_id = ? AND o.subject_id = ? ORDER BY o.mastery_score ASC LIMIT 15').all(userId, subjectId)
    : db.prepare('SELECT o.title, o.status, o.mastery_score score FROM objectives o WHERE o.user_id = ? AND o.status != "mastered" ORDER BY o.mastery_score ASC LIMIT 15').all(userId)) as { title: string; status: string; score: number }[];
  const recentMistakes = db.prepare(
    `SELECT m.question_text question, COALESCE(mp.pattern, 'onbekend') category FROM mistakes m
     LEFT JOIN mistakes_patterns mp ON mp.objective_id = m.objective_id AND mp.user_id = m.user_id
     WHERE m.user_id = ? ORDER BY m.created_at DESC LIMIT 8`
  ).all(userId) as { question: string; category: string }[];
  const recentAttempts = db.prepare(
    `SELECT q.title, a.percent, a.mode, a.finished_at at FROM attempts a JOIN quizzes q ON q.id = a.quiz_id
     WHERE a.user_id = ? AND a.status = 'finished' ORDER BY a.finished_at DESC LIMIT 5`
  ).all(userId) as { title: string; percent: number; mode: string; at: string }[];
  const dueCards = (db.prepare(
    `SELECT COUNT(*) c FROM flashcards f LEFT JOIN card_state cs ON cs.user_id = f.user_id AND cs.card_id = f.id
     WHERE f.user_id = ? AND (cs.due_at IS NULL OR cs.due_at <= datetime('now'))`
  ).get(userId) as { c: number }).c;
  const upcomingEvents = db.prepare(
    `SELECT title || ' (' || date || ')' label FROM calendar_events WHERE user_id = ? AND date >= date('now') ORDER BY date ASC LIMIT 5`
  ).all(userId) as { label: string }[];
  let documentFragment: string | undefined;
  if (documentId) {
    const doc = db.prepare('SELECT text FROM documents WHERE id = ? AND user_id = ?').get(documentId, userId) as { text: string } | undefined;
    documentFragment = doc?.text;
  } else if (subjectId) {
    const docs = db.prepare('SELECT text FROM documents WHERE subject_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 2').all(subjectId, userId) as { text: string }[];
    documentFragment = docs.map((d) => d.text.slice(0, 3000)).join('\n---\n');
  }
  return {
    userName: user.name,
    subject: subjectId ? (db.prepare('SELECT name, description FROM subjects WHERE id = ?').get(subjectId) as { name: string; description: string | null }) : undefined,
    chapter: chapterId ? ((db.prepare('SELECT title FROM chapters WHERE id = ?').get(chapterId) as { title: string } | undefined)?.title) : undefined,
    objectives,
    recentMistakes,
    recentAttempts: recentAttempts.map((a) => ({ quizTitle: a.title, percent: a.percent, mode: a.mode, at: a.at })),
    documentFragment,
    dueCards,
    upcomingEvents: upcomingEvents.map((e) => e.label)
  };
}

export async function POST(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const body = schema.parse(await req.json());
    if (!isAiConfigured()) return ok({ error: 'AI is niet geconfigureerd. Voeg MISTRAL_API_KEY toe (zie README).', configured: false }, 503);
    const db = getDb();
    const settings = JSON.parse((db.prepare('SELECT settings FROM users WHERE id = ?').get(u.id) as { settings: string }).settings);

    if (body.kind === 'recommendations') {
      const stats = buildContext(u.id);
      const subjectRows = db.prepare(
        `SELECT s.name, (SELECT COALESCE(ROUND(AVG(mastery_score)),0) FROM objectives o WHERE o.subject_id = s.id) avgMastery,
           (SELECT o.title FROM objectives o WHERE o.subject_id = s.id AND o.status != 'mastered' ORDER BY o.mastery_score ASC LIMIT 1) weakObjective
         FROM subjects s WHERE s.user_id = ?`
      ).all(u.id) as { name: string; avgMastery: number; weakObjective: string | null }[];
      const todayMinutes = (db.prepare(`SELECT COALESCE(SUM(minutes),0) m FROM events WHERE user_id = ? AND date(at) = date('now')`).get(u.id) as { m: number }).m;
      const recurringErrors = (db.prepare(`SELECT o.title FROM mistakes_patterns mp JOIN objectives o ON o.id = mp.objective_id WHERE mp.user_id = ? AND mp.occurrences >= 2 ORDER BY mp.occurrences DESC LIMIT 8`).all(u.id) as { title: string }[]).map((r) => r.title);
      const result = await dailyRecommendations(u.id, {
        userName: stats.userName,
        subjects: subjectRows,
        recentAttempts: stats.recentAttempts.map((a) => ({ percent: a.percent, at: a.at, mode: a.mode })),
        dueCards: stats.dueCards,
        upcomingEvents: stats.upcomingEvents.map((e) => ({ title: e, date: '', kind: '' })).map((x) => ({ title: x.title, date: '', kind: '' })),
        dailyGoalMinutes: (db.prepare('SELECT daily_goal_minutes FROM users WHERE id = ?').get(u.id) as { daily_goal_minutes: number }).daily_goal_minutes,
        todayMinutes, recurringErrors
      }, settings.aiModel);
      return ok(result);
    }

    const ctx = buildContext(u.id, body.subjectId, body.chapterId, body.documentId);
    const result = await coachChat(u.id, {
      context: ctx,
      history: body.history,
      message: body.message,
      settings: { detail: settings.aiDetail, behavior: settings.aiBehavior, answerLength: settings.aiAnswerLength }
    }, settings.aiModel);
    return ok(result);
  });
}
