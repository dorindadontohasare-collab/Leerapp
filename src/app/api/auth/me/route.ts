import { getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { levelForXp } from '@/lib/gamification';
import { aiStatus } from '@/lib/ai/client';
import { handle, ok } from '@/lib/api';

export async function GET() {
  return handle(async () => {
    const user = await getSessionUser();
    if (!user) return ok({ user: null, ai: aiStatus() });
    const db = getDb();
    const u = db.prepare('SELECT xp, streak_count, daily_goal_minutes, settings FROM users WHERE id = ?').get(user.id) as
      | { xp: number; streak_count: number; daily_goal_minutes: number; settings: string }
      | undefined;
    const badges = db.prepare('SELECT code, earned_at FROM badges WHERE user_id = ? ORDER BY earned_at DESC').all(user.id);
    return ok({
      user,
      xp: u?.xp ?? 0,
      level: levelForXp(u?.xp ?? 0),
      streak: u?.streak_count ?? 0,
      dailyGoalMinutes: u?.daily_goal_minutes ?? 45,
      settings: u ? JSON.parse(u.settings) : {},
      badges,
      ai: aiStatus()
    });
  });
}
