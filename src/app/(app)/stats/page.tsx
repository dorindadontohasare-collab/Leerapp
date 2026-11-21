'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, RadialBarChart, RadialBar, PolarAngleAxis
} from 'recharts';
import { api, type Subject, QUIZ_MODE_LABELS } from '@/lib/fetcher';
import { Card, Loading, ErrorState, EmptyState, ProgressBar, useToast } from '@/components/ui';

type Stats = {
  totals: { quizCount: number; avgPercent: number };
  minutes: { total: number };
  minutesToday: number;
  objectives: { total: number; mastered: number | null; attention: number | null };
  bySubject: { id: string; name: string; color: string; quizCount: number; avgPercent: number; avgMastery: number; minutes: number }[];
  timeline: { day: string; minutes: number; xp: number }[];
  attemptScores: { id: string; percent: number; mode: string; at: string; title: string }[];
  mistakeCount: { c: number };
  flashcards: { total: number; due: number | null };
  weakest: { id: string; title: string; score: number; subject: string }[];
  strongest: { id: string; title: string; score: number; subject: string }[];
  byChapter: { id: string; title: string; subject: string; avgMastery: number; objectives: number }[];
};

const PERIODS = [
  { id: '7', label: 'Dag (7d)' },
  { id: '28', label: 'Week (28d)' },
  { id: '90', label: 'Maand (90d)' },
  { id: '', label: 'Alles' }
];

export default function StatsPage() {
  const toast = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [days, setDays] = useState('28');
  const [subjectId, setSubjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams();
      if (days) qs.set('days', days);
      if (subjectId) qs.set('subjectId', subjectId);
      const [s, sub] = await Promise.all([
        api.get<Stats>(`/api/stats${qs.toString() ? `?${qs}` : ''}`),
        api.get<{ subjects: Subject[] }>('/api/subjects')
      ]);
      setStats(s); setSubjects(sub.subjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kon statistieken niet laden.');
    } finally {
      setLoading(false);
    }
  }, [days, subjectId]);

  useEffect(() => { void load(); }, [load]);

  const exportCsv = useCallback(async () => {
    try {
      const r = await api.get<{ filename: string; csv: string }>('/api/export?kind=plan&format=csv');
      const blob = new Blob([r.csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kon CSV niet exporteren.', 'error');
    }
  }, [toast]);

  if (loading && !stats) return <Loading label="Statistieken laden…" />;
  if (error && !stats) return <ErrorState message={error} onRetry={() => void load()} />;
  const s = stats;
  if (!s) return null;

  const masteryData = s.bySubject.map((b) => ({ name: b.name, waarde: Math.round(b.avgMastery), color: b.color }));
  const chapterData = s.byChapter.slice(0, 12).map((c) => ({ name: `${c.title} (${c.subject})`, waarde: Math.round(c.avgMastery) }));
  const scoreData = [...s.attemptScores].reverse().map((a, i) => ({ nr: i + 1, score: Math.round(a.percent), naam: a.title }));
  const timeData = s.timeline.map((t) => ({ dag: t.day.slice(5), minuten: t.minutes, xp: t.xp }));
  const fmtMin = (n: number) => (n >= 60 ? `${Math.floor(n / 60)}u ${n % 60}m` : `${n}m`);

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="section-title">Statistieken</h1>
          <p className="muted text-sm">Filters: bekijk je voortgang per periode, vak, hoofdstuk of leerdoel.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-auto" value={days} onChange={(e) => setDays(e.target.value)} aria-label="Periode">
            {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <select className="input w-auto" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} aria-label="Vakfilter">
            <option value="">Alle vakken</option>
            {subjects.map((sub) => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
          </select>
          <button className="btn btn-ghost text-sm" onClick={() => void exportCsv()}>⬇ CSV-export (planning)</button>
          <button className="btn btn-ghost text-sm" onClick={() => window.print()}>🖨 Afdrukken / PDF</button>
        </div>
      </div>

      {/* KPI-kaarten */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4"><div className="stat-value">{fmtMin(s.minutes.total)}</div><div className="stat-label">Totale studietijd</div></Card>
        <Card className="p-4"><div className="stat-value">{s.totals.quizCount}</div><div className="stat-label">Quizzen afgerond</div><div className="muted text-xs">Gem. score {Math.round(s.totals.avgPercent)}%</div></Card>
        <Card className="p-4"><div className="stat-value">{s.objectives.mastered ?? 0}</div><div className="stat-label">Leerdoelen beheerst</div><div className="muted text-xs">{s.objectives.attention ?? 0} vereisen aandacht</div></Card>
        <Card className="p-4"><div className="stat-value">{s.flashcards.total}</div><div className="stat-label">Flashcards</div><div className="muted text-xs">{s.flashcards.due ?? 0} vervallen nu · {s.mistakeCount.c} fouten deze periode</div></Card>
      </div>

      {s.bySubject.length === 0 ? (
        <EmptyState icon="📊" title="Nog geen statistieken" body="Begin met vakken, documenten en quizzen aan te maken — hier verschijnen automatisch echte cijfers over je studie." action={<Link className="btn btn-primary" href="/learn">Start je leeromgeving</Link>} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h2 className="section-title mb-3 text-base">Studietijd door de tijd heen</h2>
              {timeData.length === 0 ? <p className="muted text-sm">Nog geen studietijd geregistreerd in deze periode.</p> : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={timeData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--c-hairline))" />
                    <XAxis dataKey="dag" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: 'rgb(var(--c-surface))', border: '1px solid rgb(var(--c-hairline))', borderRadius: 12, fontSize: 12 }} />
                    <Area type="monotone" dataKey="minuten" stroke="#A9C9ED" fill="#DCEBFA" strokeWidth={2} />
                    <Area type="monotone" dataKey="xp" stroke="#F3C9D8" fill="#F3C9D8" strokeWidth={1.5} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card className="p-4">
              <h2 className="section-title mb-3 text-base">Beheersing per vak</h2>
              {masteryData.length === 0 ? <p className="muted text-sm">Geen vakken gevonden.</p> : (
                <ResponsiveContainer width="100%" height={220}>
                  <RadialBarChart data={masteryData} innerRadius="30%" outerRadius="100%" startAngle={90} endAngle={-270}>
                    <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                    <RadialBar background dataKey="waarde" cornerRadius={6} />
                    <Tooltip contentStyle={{ background: 'rgb(var(--c-surface))', border: '1px solid rgb(var(--c-hairline))', borderRadius: 12, fontSize: 12 }} />
                  </RadialBarChart>
                </ResponsiveContainer>
              )}
              <div className="mt-2 space-y-1">
                {s.bySubject.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
                    <span className="flex-1 truncate">{b.name}</span>
                    <span className="muted text-xs">{Math.round(b.avgMastery)}%</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <h2 className="section-title mb-3 text-base">Beheersing per hoofdstuk</h2>
              {chapterData.length === 0 ? <p className="muted text-sm">Nog geen hoofdstukken met leerdoelen.</p> : (
                <ResponsiveContainer width="100%" height={Math.max(180, chapterData.length * 34)}>
                  <BarChart data={chapterData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--c-hairline))" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={180} />
                    <Tooltip contentStyle={{ background: 'rgb(var(--c-surface))', border: '1px solid rgb(var(--c-hairline))', borderRadius: 12, fontSize: 12 }} />
                    <Bar dataKey="waarde" fill="#A9C9ED" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card className="p-4">
              <h2 className="section-title mb-3 text-base">Evolutie van quizscores</h2>
              {scoreData.length === 0 ? <p className="muted text-sm">Nog geen afgeronde quizzen in deze periode.</p> : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={scoreData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--c-hairline))" />
                    <XAxis dataKey="nr" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: 'rgb(var(--c-surface))', border: '1px solid rgb(var(--c-hairline))', borderRadius: 12, fontSize: 12 }} formatter={(v: number, _n: string, item: { payload?: { naam: string } }) => [`${v}%`, item?.payload?.naam ?? 'score']} />
                    <Line type="monotone" dataKey="score" stroke="#A9C9ED" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h2 className="section-title mb-3 text-base">Zwakke leerdoelen</h2>
              {s.weakest.length === 0 ? <p className="muted text-sm">Geen zwakke leerdoelen — mooi!</p> : (
                <ul className="space-y-2">
                  {s.weakest.map((w) => (
                    <li key={w.id}>
                      <div className="flex items-center justify-between text-sm"><span className="truncate">{w.title} <span className="muted">· {w.subject}</span></span><span className="text-xs font-semibold">{w.score}%</span></div>
                      <ProgressBar value={w.score} color="rgb(var(--c-pastelpink))" />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-4">
              <h2 className="section-title mb-3 text-base">Sterke leerdoelen</h2>
              {s.strongest.length === 0 ? <p className="muted text-sm">Nog geen leerdoelen boven 70% beheersing.</p> : (
                <ul className="space-y-2">
                  {s.strongest.map((w) => (
                    <li key={w.id}>
                      <div className="flex items-center justify-between text-sm"><span className="truncate">{w.title} <span className="muted">· {w.subject}</span></span><span className="text-xs font-semibold">{w.score}%</span></div>
                      <ProgressBar value={w.score} color="rgb(var(--c-success))" />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card>
            <h2 className="section-title mb-2 text-base">Recente quizresultaten</h2>
            {s.attemptScores.length === 0 ? <p className="muted p-2 text-sm">Nog geen resultaten.</p> : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead><tr><th>Quiz</th><th>Modus</th><th>Score</th><th>Afgerond</th></tr></thead>
                  <tbody>
                    {s.attemptScores.slice(0, 12).map((a) => (
                      <tr key={a.id}>
                        <td className="max-w-[280px] truncate">{a.title}</td>
                        <td>{QUIZ_MODE_LABELS[a.mode] ?? a.mode}</td>
                        <td className={a.percent >= 70 ? 'text-[rgb(var(--c-success))]' : a.percent >= 50 ? '' : 'text-[rgb(var(--c-danger))] font-semibold'}>{Math.round(a.percent)}%</td>
                        <td className="text-sm">{a.at?.slice(0, 16).replace('T', ' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
