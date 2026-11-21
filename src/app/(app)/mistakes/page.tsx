'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type Subject } from '@/lib/fetcher';
import { Card, Loading, ErrorState, EmptyState, Tabs, ProgressBar, useToast } from '@/components/ui';

type Mistake = {
  id: string; question_text: string; user_answer: string | null; correct_answer: string | null;
  explanation: string | null; count: number; last_practiced_at: string | null; card_id: string | null;
  subject_id: string | null; subjectName?: string | null; chapterTitle?: string | null;
  objectiveTitle?: string | null; objective_id?: string | null; patternOccurrences?: number | null;
};

type Pattern = {
  id: string; objective_id: string | null; pattern: string; occurrences: number;
  subjectName?: string | null; objectiveTitle?: string | null; score?: number | null;
};

export default function MistakesPage() {
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState('mijn');
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectFilter, setSubjectFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const qs = subjectFilter ? `?subjectId=${encodeURIComponent(subjectFilter)}` : '';
      const [m, s] = await Promise.all([
        api.get<{ mistakes: Mistake[]; patterns: Pattern[] }>(`/api/mistakes${qs}`),
        api.get<{ subjects: Subject[] }>('/api/subjects')
      ]);
      setMistakes(m.mistakes); setPatterns(m.patterns); setSubjects(s.subjects);
      const open = new URLSearchParams(window.location.search).get('open');
      if (open) { setOpenId(open); setTab('mijn'); }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kon foutbibliotheek niet laden.');
    } finally {
      setLoading(false);
    }
  }, [subjectFilter]);

  useEffect(() => { void load(); }, [load]);

  const saveAsCard = useCallback(async (m: Mistake) => {
    try {
      const r = await api.patch<{ savedAsCard?: string }>(`/api/mistakes/${m.id}`, { action: 'save_as_card' });
      toast.show('Fout als flashcard opgeslagen.', 'success');
      void r;
      void load();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kon flashcard niet opslaan.', 'error');
    }
  }, [toast, load]);

  const practice = useCallback(async (ids?: string[]) => {
    const mistakeIds = ids ?? (selected.length ? selected : mistakes.slice(0, 8).map((m) => m.id));
    if (!mistakeIds.length) { toast.show('Er zijn nog geen fouten om te oefenen.', 'warning'); return; }
    setBusy(true);
    try {
      const r = await api.post<{ quizId: string }>('/api/mistakes/practice', { mistakeIds });
      router.push(`/quizzes/${r.quizId}`);
    } catch (err) {
      const c = err instanceof Error && (err as Error & { configured?: boolean }).configured;
      toast.show(`${err instanceof Error ? err.message : 'Kon oefenronde niet maken.'}${c ? ' Je kunt in de quizbibliotheek handmatig een quiz maken of importeren.' : ''}`, c ? 'warning' : 'error');
    } finally {
      setBusy(false);
    }
  }, [selected, mistakes, router, toast]);

  const del = useCallback(async (m: Mistake) => {
    try {
      await api.del(`/api/mistakes/${m.id}`);
      setMistakes((prev) => prev.filter((x) => x.id !== m.id));
      setSelected((prev) => prev.filter((x) => x !== m.id));
      toast.show('Fout verwijderd.', 'success');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kon fout niet verwijderen.', 'error');
    }
  }, [toast]);

  const recurring = useMemo(() => mistakes.filter((m) => m.count >= 2), [mistakes]);
  const openMistakes = useMemo(() => (openId ? mistakes.filter((m) => m.id === openId) : []), [mistakes, openId]);

  if (loading) return <Loading label="Foutbibliotheek laden…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="section-title">Foutbibliotheek</h1>
          <p className="muted text-sm">{mistakes.length } fouten, waarvan {recurring.length} vaker voorkomend — die verdienen extra aandacht.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost" onClick={() => { setSelected([]); setTab('mijn'); }} disabled={!mistakes.length}>↺ Selectie wissen</button>
          <button className="btn btn-primary" onClick={() => void practice()} disabled={busy || !mistakes.length}>
            {busy ? 'Maken…' : `🎯 Oefenen (${selected.length || Math.min(mistakes.length, 8)} fouten)`}
          </button>
        </div>
      </div>

      <Card>
        <Tabs tabs={[{ id: 'mijn', label: `Alle fouten (${mistakes.length})` }, { id: 'patronen', label: `Patronen (${patterns.length})` }]} active={tab} onChange={setTab} />
        <div className="mb-3 flex items-center gap-2">
          <label className="label" htmlFor="ms-subj">Vak</label>
          <select id="ms-subj" className="input w-auto" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
            <option value="">Alle vakken</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {tab === 'mijn' ? (
          mistakes.length === 0 ? (
            <EmptyState icon="✅" title="Geen fouten (nog)" body="Zodra je quizvragen fout maakt, komen ze hier terecht — met het juiste antwoord en een uitleg. Foute quizvragen met één correct meerkeuzeantwoord worden nooit als bewijs van beheersing gerekend." />
          ) : (
            <ul className="divide-y divide-[rgb(var(--c-hairline))]">
              {[...(openMistakes.length ? openMistakes : []), ...mistakes.filter((m) => m.id !== openId)].map((m) => (
                <li key={m.id} className="py-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-[rgb(var(--c-accentblue))]"
                      checked={selected.includes(m.id)}
                      onChange={() => setSelected((prev) => (prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id]))}
                      aria-label={`Fout selecteren: ${m.question_text.slice(0, 40)}`}
                    />
                    <div className="min-w-0 flex-1">
                      <button className="text-left font-medium hover:underline" onClick={() => setOpenId(openId === m.id ? null : m.id)}>
                        {m.question_text}
                        {m.patternOccurrences && m.patternOccurrences >= 2 && <span className="ml-2 chip text-xs">🔁 {m.patternOccurrences}×</span>}
                      </button>
                      <p className="muted mt-0.5 text-xs">
                        {m.subjectName ?? '—'}{m.chapterTitle ? ` · ${m.chapterTitle}` : ''}{m.objectiveTitle ? ` · ${m.objectiveTitle}` : ''} · {m.count}× fout{m.last_practiced_at ? ` · laatst geoefend ${m.last_practiced_at.slice(0, 10)}` : ''}
                      </p>
                      {openId === m.id && (
                        <div className="mt-2 space-y-2 rounded-xl bg-[rgb(var(--c-surface2))] p-3 text-sm">
                          <p><span className="font-semibold">Jouw antwoord:</span> {m.user_answer ?? '(geen antwoord)'}</p>
                          {m.correct_answer && <p><span className="font-semibold">Juiste antwoord:</span> {m.correct_answer}</p>}
                          {m.explanation && <p className="muted">{m.explanation}</p>}
                          {m.card_id && <p className="text-xs text-[rgb(var(--c-success))]">💾 Opgeslagen als flashcard.</p>}
                          <div className="flex gap-2 pt-1">
                            <button className="btn btn-soft text-xs" onClick={() => void practice([m.id])} disabled={busy}>Vergelijkbare vragen oefenen</button>
                            {!m.card_id && <button className="btn btn-soft text-xs" onClick={() => void saveAsCard(m)}>Opslaan als flashcard</button>}
                            <button className="btn btn-danger text-xs" onClick={() => void del(m)}>Verwijderen</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : (
          patterns.length === 0 ? (
            <EmptyState icon="🔍" title="Nog geen patronen gevonden" body="Wanneer je dezelfde fout twee keer of vaker maakt op een leerdoel, verschijnt hier een patroon met gerichte hulp." />
          ) : (
            <ul className="space-y-3">
              {patterns.map((p) => (
                <li key={p.id} className="card p-4">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="font-semibold">🔁 {p.objectiveTitle ?? p.pattern}</p>
                    <span className="chip">{p.occurrences}× voorgekomen</span>
                  </div>
                  <p className="muted text-sm">{p.subjectName ?? ''}{p.pattern !== p.objectiveTitle ? ` · ${p.pattern}` : ''}</p>
                  <div className="mt-2">
                    <ProgressBar value={p.score ?? 0} />
                    <p className="muted mt-1 text-xs">Beheersingspercentage van dit leerdoel: {p.score ?? 0}%</p>
                  </div>
                  {p.objective_id && <button className="btn btn-soft mt-3 text-xs" onClick={() => void practice(mistakes.filter((m) => m.objective_id === p.objective_id).map((m) => m.id))} disabled={busy}>Oefen dit pattern</button>}
                </li>
              ))}
            </ul>
          )
        )}
      </Card>

      <Card className="bg-[rgb(var(--c-surface2))]">
        <p className="muted text-sm">💡 <strong>Hoe dit werkt:</strong> elk fout antwoord wordt automatisch bewaard met vraag, jouw antwoord, het juiste antwoord en de uitleg.Selecteer fouten en kies <em>Oefenen</em> om vergelijkbare oefenvragen te laten maken ( vereist AI-sleutel), of sla de fout op als flashcard om via spaced repetition te herhalen.</p>
      </Card>
    </div>
  );
}
