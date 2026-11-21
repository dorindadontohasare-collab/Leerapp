import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { aiStatus, throttleInfo } from '@/lib/ai/client';

const DEFAULTS = {
  theme: 'system', language: 'nl', aiModel: 'auto', aiDetail: 'gebalanceerd', aiAnswerLength: 'normaal',
  aiBehavior: 'encouraging', notifications: { daily: true, exam: true, flashcards: true, breaks: false },
  coachContextScope: 'chapter', pomodoro: { work: 25, break: 5, long: 15 }
};

export async function GET() {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const db = getDb();
    const user = db.prepare('SELECT settings, email, name, xp, streak_count, daily_goal_minutes FROM users WHERE id = ?').get(u.id) as
      | { settings: string; email: string; name: string; xp: number; streak_count: number; daily_goal_minutes: number };
    return ok({
      email: user.email, name: user.name, xp: user.xp, streak: user.streak_count, dailyGoalMinutes: user.daily_goal_minutes,
      settings: { ...DEFAULTS, ...JSON.parse(user.settings) },
      ai: { ...aiStatus(), throttle: throttleInfo(u.id) }
    });
  });
}

export async function PATCH(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const db = getDb();
    const body = (await req.json()) as Record<string, unknown> & { dailyGoalMinutes?: number };
    if (typeof body.dailyGoalMinutes === 'number') {
      db.prepare('UPDATE users SET daily_goal_minutes = ? WHERE id = ?').run(Math.max(5, Math.min(600, body.dailyGoalMinutes)), u.id);
      delete body.dailyGoalMinutes;
    }
    if (Object.keys(body).length) {
      const current = JSON.parse((db.prepare('SELECT settings FROM users WHERE id = ?').get(u.id) as { settings: string }).settings);
      const merged = { ...current };
      for (const [k, v] of Object.entries(body)) merged[k] = v;
      db.prepare('UPDATE users SET settings = ? WHERE id = ?').run(JSON.stringify(merged), u.id);
    }
    return ok({ ok: true });
  });
}
