'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, type User } from '@/lib/fetcher';
import { useSession } from '@/components/session-provider';
import { Card, ProgressBar, Loading, ErrorState, EmptyState } from '@/components/ui';

type Stats = {
  totals: { quizCount: number; avgPercent: number };
  minutes: { total: number };
  objectives: { total: number; mastered: number | null; attention: number | null };
  bySubject: { id: string; name: string; color: string; avgMastery: number; objectiveCount?: number }[];
  dueCards?: number; openTasks?: number; nextExam?: { id: string; title: string; exam_date: string; daysLeft: number } | null; streak?: number;
  dashboard: { minutesToday: number; goalPercent: number; openTasks: number; dueCards: number; nextExam: { id: string; title: string; exam_date: string; daysLeft: number } | null; streak: number } | null;
};

type Recommendation = { title: string; body: string; action: string; urgency: 'info' | 'attention' | 'critical' };
type Recommendations =
  | { configured: false; local: Recommendation[] }
  | { configured: true; items: Recommendation[] };

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'Goedenacht';
  if (h < 12) return 'Goedemorgen';
  if (h < 18) return 'Goedemiddag';
  return 'Goedenavond';
}

const QUICK_ACTIONS = [
  { href: '/documents?upload=1', icon: '⬆️', label: 'Document uploaden' },
  { href: '/quizzes?create=1', icon: '✨', label: 'Quiz maken' },
  { href: '/quizzes?import=1', icon: '📥', label: 'Quiz importeren' },
  { href: '/apps?import=1', icon: '🧱', label: 'Leerapp toevoegen' },
  { href: '/flashcards?create=1', icon: '🃏', label: 'Flashcards maken' },
  { href: '/coach', icon: '🤖', label: 'AI-studiecoach' },
  { href: '/planner', icon: '🗺️', label: 'Studieplanning' }
];

export default function DashboardPage() {
  const { user, loading: userLoading } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recs, setRecs] = useState<Recommendations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const s = await api.get<Stats>('/api/stats?days=7&dashboard=1');
      setStats(s);
      try {
        const r = await api.post<Recommendations>('/api/coach', { kind: 'recommendations' });
        setRecs(r);
      } catch {
        setRecs({ configured: false, local: localRecommendations(s) });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kon dashboard niet laden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading || userLoading) return <Loading label="Dashboard laden…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  const u = user as User;
  const today = new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="space-y-6 pt-2">
      {/* Welkomstgedeelte */}
      <section className="card flex flex-col gap-4 bg-gradient-to-br from-softblue/60 to-surface p-6 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{today}</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-ink">
            {greeting()}, {u?.name?.split(' ')[0] ?? 'student'} 👋
          </h1>
          <p className="mt-2 max-w-xl text-sm text-ink2">{insight(stats)}</p>
        </div>
        <div className="min-w-[220px] rounded-xl border border-hairline bg-surface p-4">
          <p className="stat-label">Dagelijkse studiedoel</p>
          <p className="mt-1 text-sm font-semibold text-ink">{u?.dailyGoalMinutes ?? 45} minuten</p>
          <div className="mt-2"><ProgressBar value={stats?.dashboard?.minutesToday ?? 0} max={u?.dailyGoalMinutes ?? 45} /></div>
          <p className="mt-1 text-xs text-muted">{stats?.dashboard?.minutesToday ?? 0} van {u?.dailyGoalMinutes ?? 45} min. vandaag · 🔥 streak {stats?.dashboard?.streak ?? 0}</p>
        </div>
      </section>

      {/* Snelle acties */}
      <section>
        <h2 className="section-title mb-3">Snelle acties</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {QUICK_ACTIONS.map((a) => (
            <Link key={a.label} href={a.href} className="card flex flex-col items-center gap-2 px-3 py-4 text-center transition-transform hover:-translate-y-0.5">
              <span className="text-2xl" aria-hidden="true">{a.icon}</span>
              <span className="text-xs font-semibold text-ink2">{a.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Statistieken */}
      <section>
        <h2 className="section-title mb-3">Vooruitgang</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <StatCard label="Totale studietijd" value={stats ? `${Math.round(stats.minutes.total / 60)}u ${stats.minutes.total % 60}m` : '–'} icon="⏱️" />
          <StatCard label="Quizzen afgerond" value={String(stats?.totals.quizCount ?? 0)} icon="🧩" />
          <StatCard label="Gemiddelde score" value={stats ? `${Math.round(stats.totals.avgPercent)}%` : '–'} icon="🎯" />
          <StatCard label="Beheerste leerdoelen" value={String(stats?.objectives.mastered ?? 0)} icon="✅" />
        </div>
      </section>

      {/* Aanbevelingen */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">Aanbevelingen voor jou</h2>
          <Link href="/coach" className="text-sm font-semibold link">{recs && !recs.configured ? 'AI niet geconfigureerd' : 'AI-coach openen'}</Link>
        </div>
        {(recs ? (recs.configured ? recs.items : recs.local) : []).length === 0 ? (
          <EmptyState
            icon="🌱"
            title="Nog geen aanbevelingen"
            body="Zodra je documenten toevoegt en quizzen maakt, past de coach de aanbevelingen aan jouw leerproces aan."
            action={<Link href="/documents" className="btn-primary">Document uploaden</Link>}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {(recs!.configured ? (recs as { configured: true; items: Recommendation[] }).items : (recs as { configured: false; local: Recommendation[] }).local)
              .slice(0, 4).map((r, i) => (
              <Card key={i} className={`flex flex-col gap-2 ${r.urgency === 'critical' ? 'border-danger/40' : r.urgency === 'attention' ? 'border-warning/40' : ''}`}>
                <div className="flex items-center gap-2">
                  <span aria-hidden="true">{r.urgency === 'critical' ? '🚨' : r.urgency === 'attention' ? '⚠️' : '💡'}</span>
                  <h3 className="font-bold text-ink">{r.title}</h3>
                </div>
                <p className="text-sm text-ink2">{r.body}</p>
                {r.action && <button className="btn-soft mt-1 w-fit" onClick={() => executeAction(r.action, router)}>Doe dit nu →</button>}
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Voortgang per vak */}
      <section>
        <h2 className="section-title mb-3">Voortgang per vak</h2>
        {!stats || stats.bySubject.length === 0 ? (
          <EmptyState
            icon="📚"
            title="Nog geen vakken"
            body="Maak je eerste vak aan in de leeromgeving en voeg documenten toe om te starten."
            action={<Link href="/learn" className="btn-primary">Naar mijn leeromgeving</Link>}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {stats.bySubject.map((s) => (
              <Card key={s.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-bold text-ink">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
                    {s.name}
                  </span>
                  <span className="text-sm font-semibold text-ink2">{Math.round(s.avgMastery)}%</span>
                </div>
                <ProgressBar value={s.avgMastery} color={s.color} />
                <p className="text-xs text-muted">{s.objectiveCount} leerdoelen · <Link className="link" href={`/learn?subject=${s.id}`}>openen</Link></p>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Vandaag / komende examen */}
      <section className="grid gap-3 md:grid-cols-3">
        <Card className="space-y-1">
          <p className="stat-label">Flashcards vandaag</p>
          <p className="stat-value">{stats?.dashboard?.dueCards ?? 0}</p>
          <Link href="/flashcards" className="text-sm font-semibold link">Nu herhalen →</Link>
        </Card>
        <Card className="space-y-1">
          <p className="stat-label">Open studytaken</p>
          <p className="stat-value">{stats?.dashboard?.openTasks ?? 0}</p>
          <Link href="/planner" className="text-sm font-semibold link">Planning bekijken →</Link>
        </Card>
        <Card className="space-y-1">
          <p className="stat-label">Komend examen</p>
          {stats?.dashboard?.nextExam ? (
            <>
              <p className="truncate font-bold text-ink">{stats.dashboard!.nextExam!.title}</p>
              <p className="text-sm text-muted">over {stats.dashboard!.nextExam!.daysLeft} dagen</p>
              <Link href="/exam" className="text-sm font-semibold link">Nog niet beheerst bekijken →</Link>
            </>
          ) : (
            <p className="text-sm text-muted">Nog geen examen gepland.</p>
          )}
        </Card>
      </section>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <Card className="flex items-center gap-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-softblue text-xl" aria-hidden="true">{icon}</div>
      <div>
        <p className="stat-value">{value}</p>
        <p className="stat-label">{label}</p>
      </div>
    </Card>
  );
}

function insight(stats: Stats | null): string {
  if (!stats) return 'Je dashboard vult zich zodra je begint te studeren.';
  const mt = stats.dashboard?.minutesToday ?? 0;
  if (mt > 0) return `Je zit op ${mt} minuten vandaag. Mooi bezig — houd de streak vast!`;
  if ((stats.objectives.attention ?? 0) > 0) return `Er ${(stats.objectives.attention ?? 0) === 1 ? 'is' : 'zijn'} ${(stats.objectives.attention ?? 0)} leerdoel${(stats.objectives.attention ?? 0) === 1 ? '' : 'en'} dat nog extra aandacht vraagt.`;
  if (stats.dashboard?.nextExam) return `Je examen "${stats.dashboard.nextExam.title}" is over ${stats.dashboard.nextExam.daysLeft} dagen. Tijd om gericht te herhalen.`;
  return 'Nog geen studie-activiteit deze week. Voeg een document toe en laat de AI een quiz maken.';
}

function executeAction(action: string, router: ReturnType<typeof useRouter>) {
  const routes: [string, string][] = [
    ['/learn', '/learn'], ['/documents', '/documents'], ['/quiz', '/quizzes'],
    ['/flashcard', '/flashcards'], ['/planner', '/planner'], ['/apps', '/apps'], ['/coach', '/coach'], ['/exam', '/exam'], ['/mistake', '/mistakes']
  ];
  const a = action.toLowerCase();
  for (const [key, href] of routes) if (a.includes(key)) { router.push(href); return; }
  router.push('/');
}

function localRecommendations(s: Stats | null): Recommendation[] {
  const items: Recommendation[] = [];
  if (!s) return items;
  if ((s.dashboard?.dueCards ?? 0) > 0) items.push({ title: `${s.dashboard?.dueCards} flashcards wachten op herhaling`, body: 'Herhaal ze nu op het juiste memorisatiemoment.', action: 'naar flashcards', urgency: (s.dashboard?.dueCards ?? 0) > 20 ? 'critical' : 'attention' });
  if ((s.objectives.attention ?? 0) > 0) items.push({ title: `${s.objectives.attention} leerdoel${(s.objectives.attention ?? 0) === 1 ? '' : 'en'} met lage beheersing`, body: 'Oefen ze via de zwakke-puntenmodus van de quiz engine.', action: 'quiz maken', urgency: 'attention' });
  const ex = s.dashboard?.nextExam;
  if (ex) items.push({ title: `Examen in zicht: ${ex.title}`, body: `Nog ${ex.daysLeft} dagen. Laat een proefexamen genereren op examenniveau.`, action: 'examenvoorbereiding openen', urgency: 'attention' });
  if (!items.length) items.push({ title: 'Goede start!', body: 'Upload een document en laat de AI er automatisch hoofdstukken en quizvragen uit halen.', action: 'document uploaden', urgency: 'info' });
  return items;
}
