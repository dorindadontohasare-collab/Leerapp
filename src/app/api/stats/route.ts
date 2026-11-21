import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getStats, getDashboardExtras } from '@/lib/stats';

export async function GET(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const p = new URL(req.url).searchParams;
    const days = p.get('days') ? Number(p.get('days')) : undefined;
    const subjectId = p.get('subjectId') || undefined;
    const stats = getStats(u.id, days, subjectId);
    const extras = p.get('dashboard') === '1' ? getDashboardExtras(u.id) : null;
    return ok({ ...stats, dashboard: extras });
  });
}
