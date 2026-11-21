'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, QUESTION_TYPE_LABELS, QUIZ_MODE_LABELS, type QuizSummary, type Subject } from '@/lib/fetcher';
import { Card, Modal, EmptyState, Loading, ErrorState, useToast, Confirm, Spinner, Tabs } from '@/components/ui';

type ParsedQuestion = {
  type: string;
  prompt: string;
  options: { id: string; text: string; correct?: boolean }[];
  confidence: 'parsed' | 'unknown' | 'ai_interpretation';
  note?: string;
};



const ALL_TYPES = Object.keys(QUESTION_TYPE_LABELS);

export default function QuizzesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [genOpen, setGenOpen] = useState(params.get('create') === '1');
  const [importOpen, setImportOpen] = useState(params.get('import') === '1');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const subjectFilter = params.get('subject') ?? '';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [q, s] = await Promise.all([
        api.get<{ quizzes: QuizSummary[] }>(`/api/quizzes${subjectFilter ? `?subjectId=${subjectFilter}` : ''}`),
        api.get<{ subjects: Subject[] }>('/api/subjects')
      ]);
      setQuizzes(q.quizzes);
      setSubjects(s.subjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kon quizzen niet laden.');
    } finally {
      setLoading(false);
    }
  }, [subjectFilter]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Quizbibliotheek</h1>
          <p className="muted">Genereer quizzen op basis van je leerstof, of importeer bestaande quizvragen.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setImportOpen(true)}>📥 Importeren</button>
          <button className="btn-primary" onClick={() => setGenOpen(true)}>✨ Quiz genereren</button>
        </div>
      </div>

      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : (
        quizzes.length === 0 ? (
          <EmptyState
            icon="🧩"
            title="Nog geen quizzen"
            body="Laat de AI vragen genereren op basis van een document of importeer je bestaande quizvragen (tekst of JSON)."
            action={<div className="flex gap-2"><button className="btn-ghost" onClick={() => setImportOpen(true)}>Importeren</button><button className="btn-primary" onClick={() => setGenOpen(true)}>Quiz genereren</button></div>}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {quizzes.map((quiz) => {
              const quizAny = quiz as unknown as Record<string, unknown>;
              return (
                <Card key={quiz.id} className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-ink">{String(quizAny.title ?? '')}</p>
                      <p className="text-xs text-muted">{String(quizAny.subjectName ?? 'Zonder vak')} · {String(quizAny.questionCount ?? '')} vragen</p>
                    </div>
                    <span className="chip bg-softblue">{String(quizAny.origin ?? '')}</span>
                  </div>
                  <p className="text-xs text-muted">Gemiddeld: {quiz.avgPercent != null ? `${Math.round(quiz.avgPercent)}%` : 'nog geen pogingen'}</p>
                  <div className="mt-1 flex gap-2">
                    <Link href={`/quizzes/${quiz.id}`} className="btn-primary flex-1 px-3 py-1.5 text-xs">Starten</Link>
                    <button className="btn-ghost px-2 py-1.5 text-xs" onClick={() => setConfirmId(quiz.id)} aria-label="Verwijderen">🗑️</button>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      )}

      <GenerateModal open={genOpen} subjects={subjects} defaultSubject={subjectFilter || subjects[0]?.id || ''} onClose={() => setGenOpen(false)} onCreated={(id) => { setGenOpen(false); router.push(`/quizzes/${id}`); }} />
      <ImportModal open={importOpen} subjects={subjects.map((s) => ({ id: s.id, name: s.name }))} onClose={() => setImportOpen(false)} onImported={() => { setImportOpen(false); void load(); }} />

      <Confirm
        open={!!confirmId}
        message="Deze quiz en alle bijbehorende pogingen en resultaten verwijderen?"
        onCancel={() => setConfirmId(null)}
        onConfirm={async () => {
          try { await api.del(`/api/quizzes/${confirmId}`); toast.push('Quiz verwijderd', 'success'); setConfirmId(null); void load(); }
          catch { toast.push('Verwijderen mislukt', 'error'); }
        }}
      />
    </div>
  );
}

function GenerateModal({ open, subjects, defaultSubject, onClose, onCreated }: { open: boolean; subjects: Subject[]; defaultSubject: string; onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const [subjectId, setSubjectId] = useState('');
  const [chapters, setChapters] = useState<{ id: string; title: string }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState('medium');
  const [modeCli] = useState(['practice']);
  const [types, setTypes] = useState<string[]>(['mc_single', 'mc_multi', 'true_false', 'open', 'fill', 'concept']);
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<{ weak: number; total: number } | null>(null);

  useEffect(() => { setSubjectId(defaultSubject); }, [defaultSubject, open]);

  useEffect(() => {
    if (!subjectId) { setChapters([]); setSelected([]); return; }
    void (async () => {
      try {
        const r = await api.get<{ chapters?: { id: string; title: string }[] }>(`/api/subjects/${subjectId}/chapters`.replace('/chapters', '/chapters'));
        setChapters(r.chapters ?? []); setSelected([]);
        const s2 = await api.get<Subject>(`/api/deck`);
      } catch { setChapters([]); }
    })();
  }, [subjectId, open]);

  const generate = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ id: string }>('/api/quizzes/generate', {
        title: 'Genereer-' + new Date().toLocaleDateString('nl-NL'), subjectId, chapterIds: selected, count, types, difficulty, mode: modeCli[0] === 'practice' ? 'normal' : 'normal'
      });
      if (r && 'error' in (r as object)) { toast.push(String((r as { error?: string }).error), 'error'); return; }
      if (!r.id) { toast.push('Kon quiz niet opslaan', 'error'); return; }
      onCreated(r.id);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Genereren mislukt', 'error');
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="AI-quiz genereren" wide>
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="g-subject">Vak</label>
          <select id="g-subject" className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">— kies een vak —</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {subjects.length === 0 && <p className="mt-1 text-xs text-warning">Maak eerst een vak aan in de leeromgeving.</p>}
        </div>

        {chapters.length > 0 && (
          <div>
            <p className="label">Hoofdstukken (leeg = alles)</p>
            <div className="flex flex-wrap gap-2">
              {chapters.map((c) => (
                <button key={c.id} onClick={() => setSelected(selected.includes(c.id) ? selected.filter((x) => x !== c.id) : [...selected, c.id])}
                  className={`chip ${selected.includes(c.id) ? 'bg-accentblue text-ink' : 'bg-surface2 text-ink2'}`}>{c.title}</button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="g-count">Aantal vragen</label>
            <select id="g-count" className="input" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[5, 10, 15, 20, 30, 40].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="g-diff">Moeilijkheid</label>
            <select id="g-diff" className="input" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="easy">Gemakkelijk</option>
              <option value="medium">Gemiddeld</option>
              <option value="hard">Moeilijk</option>
              <option value="exam">Examenniveau</option>
            </select>
          </div>
        </div>

        <div>
          <p className="label">Vraagtypes</p>
          <div className="flex flex-wrap gap-1.5">
            {ALL_TYPES.map((t) => (
              <button key={t} onClick={() => setTypes(types.includes(t) ? types.filter((x) => x !== t) : [...types, t])}
                className={`chip ${types.includes(t) ? 'bg-accentblue text-ink' : 'bg-surface2 text-muted'}`}>{QUESTION_TYPE_LABELS[t]}</button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn-primary" onClick={generate} disabled={busy || !subjectId || types.length === 0}>
            {busy ? <><Spinner size={15} /> Genereren (kan even duren)…</> : '✨ Quiz genereren'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ImportModal({ open, subjects, onClose, onImported }: { open: boolean; subjects: { id: string; name: string }[]; onClose: () => void; onImported: () => void }) {
  const toast = useToast();
  const [tab, setTab] = useState('text');
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [preview, setPreview] = useState<{ quizId?: string; needsReview?: number; questions?: ParsedQuestion[] } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setSubjectId(subjects[0]?.id ?? ''); }, [subjects, open]);

  const doImport = async () => {
    setBusy(true);
    try {
      let payload: Record<string, unknown>;
      if (tab === 'text' || tab === 'json') {
        payload = { format: tab, content, title, subjectId: subjectId || null };
      } else {
        if (!file) return;
        const fileContent = await file.text();
        const format = file.name.toLowerCase().endsWith('.json') ? 'json' : 'text';
        payload = { format, content: fileContent, title: title || file.name.replace(/\.[^.]+$/, ''), subjectId: subjectId || null };
      }
      const r = await api.post<{ id?: string; needsReview?: number; questions?: ParsedQuestion[]; error?: string }>('/api/quizzes/import', payload);
      if (r.error) { toast.push(r.error, 'error'); return; }
      setPreview(r);
      toast.push(`Quiz geïmporteerd${r.needsReview ? ` — ${r.needsReview} antwoorden moet je controleren` : ''}`, r.needsReview ? 'info' : 'success');
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Import mislukt', 'error');
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Quiz importeren" wide>
      <div className="space-y-4">
        {!preview ? (
          <>
            <Tabs tabs={[{ id: 'text', label: 'Tekst' }, { id: 'json', label: 'JSON' }, { id: 'file', label: 'Bestand' }]} active={tab === 'file' ? 'file' : tab} onChange={(id) => setTab(id)} />
            {tab === 'text' && (
              <p className="rounded-lg bg-softblue/50 px-3 py-2 text-xs text-ink2">
                Voer vragen in als genummerde lijst (<code>1. Vraag? a) optie b) optie</code>) en zet antwoorden in een aparte sectie zoals <code>Antwoorden: 1. A, 2. C</code>. Onzekere antwoorden worden gemarkeerd.
              </p>
            )}
            {tab === 'text' && <textarea className="input min-h-44" placeholder={'1. Wat is BTW?\na) een belasting op arbeid\nb) een belasting op consumptie\n\nAntwoorden: 1. b'} value={content} onChange={(e) => setContent(e.target.value)} />}
            {tab === 'json' && <textarea className="input min-h-44 font-mono text-xs" placeholder='{"questions":[{"type":"mc_single","prompt":"…","options":[{"id":"o1","text":"…"}],"answer":{"correct":"o1"}}]}' value={content} onChange={(e) => setContent(e.target.value)} />}
            {tab === 'file' && (
              <input type="file" accept=".txt,.md,.csv,.json" className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="imp-title">Titel</label><input id="imp-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Naam van de quiz" /></div>
              <div>
                <label className="label" htmlFor="imp-subject">Vak koppelen</label>
                <select id="imp-subject" className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                  <option value="">— kies —</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={onClose}>Annuleren</button>
              <button className="btn-primary" onClick={doImport} disabled={busy || (tab !== 'file' ? !content.trim() : !file)}>{busy ? <Spinner size={15} /> : 'Importeren'}</button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-ink2">
              De quiz is opgeslagen in je bibliotheek ({preview.needsReview ?? 0} antwoorden zonder zeker antwoordmodel — die worden met zelfbeoordeling of AI gecorrigeerd).
            </p>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {(preview.questions ?? []).map((q, i) => (
                <div key={i} className={`rounded-lg border px-3 py-2 ${q.confidence === 'unknown' ? 'border-warning/50' : 'border-hairline'}`}>
                  <p className="text-sm font-semibold text-ink">{i + 1}. {q.prompt}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {QUESTION_TYPE_LABELS[q.type] ?? q.type} · antwoordmodel: {q.confidence === 'parsed' ? 'herkend' : q.confidence === 'ai_interpretation' ? 'AI-interpretatie (niet officieel)' : 'onbekend — controleer'}
                    {q.note ? ` · ${q.note}` : ''}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => { setPreview(null); setContent(''); onClose(); }}>Sluiten</button>
              {preview.quizId && <Link className="btn-primary" href={`/quizzes/${preview.quizId}`}>Naar quiz →</Link>}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
