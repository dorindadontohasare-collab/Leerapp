'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Subject, type Chapter } from '@/lib/fetcher';
import { Card, Loading, ErrorState, EmptyState, Modal, Confirm, ProgressBar, Tabs, useToast } from '@/components/ui';

type Card = {
  id: string; front: string; back: string; hint: string | null;
  subject_id: string | null; chapter_id: string | null; objective_id: string | null;
  subjectName?: string | null; chapterTitle?: string | null; objectiveTitle?: string | null;
  origin?: string; due_at?: string | null; reps?: number | null; interval_days?: number | null; lapses?: number | null; tags?: string[];
};

type DueCard = {
  id: string; front: string; back: string; hint: string | null; objectiveId: string | null; subjectId: string | null;
  state: { ease: number; reps: number; interval_days: number; lapses: number; due_at: string };
};

const GRADES: { grade: number; label: string; hint: string }[] = [
  { grade: 0, label: 'Geen idee', hint: 'Volledig vergeten' },
  { grade: 1, label: 'Fout', hint: 'Niet geweten' },
  { grade: 2, label: 'Lastig', hint: 'Geweten maar moeilijk' },
  { grade: 3, label: 'Oké', hint: 'Geweten met moeite' },
  { grade: 4, label: 'Goed', hint: 'Goed geweten' },
  { grade: 5, label: 'Razendsnel', hint: 'Nog eens overzien' }
];

export default function FlashcardsPage() {
  const toast = useToast();
  const [tab, setTab] = useState('mijn');
  const [cards, setCards] = useState<Card[]>([]);
  const [due, setDue] = useState<DueCard[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [ subjectFilter, setSubjectFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [cardModal, setCardModal] = useState(false);
  const [editCard, setEditCard] = useState<Card | null>(null);
  const [front, setFront] = useState(''); const [back, setBack] = useState(''); const [hint, setHint] = useState('');
  const [newSubjectId, setNewSubjectId] = useState(''); const [newChapterId, setNewChapterId] = useState('');
  const [confirmDel, setConfirmDel] = useState<Card | null>(null);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sessionStart] = useState(() => Date.now());
  const [reviewed, setReviewed] = useState(0);

  const [genOpen, setGenOpen] = useState(false);
  const [genSubjectId, setGenSubjectId] = useState(''); const [genChapterId, setGenChapterId] = useState('');
  const [genSource, setGenSource] = useState<'document' | 'subject' | 'text'>('document');
  const [genDocId, setGenDocId] = useState(''); const [genText, setGenText] = useState('');
  const [genCount, setGenCount] = useState(15);
  const [genBusy, setGenBusy] = useState(false);
  const [documents, setDocuments] = useState<{ id: string; title: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const qs = subjectFilter ? `?subjectId=${encodeURIComponent(subjectFilter)}` : '';
      const [c, d, s] = await Promise.all([
        api.get<{ cards: Card[] }>(`/api/flashcards${qs}`),
        api.get<{ due: DueCard[] }>(`/api/flashcards/due${qs}`),
        api.get<{ subjects: Subject[] }>('/api/subjects')
      ]);
      setCards(c.cards); setDue(d.due); setSubjects(s.subjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kon flashcards niet laden.');
    } finally {
      setLoading(false);
    }
  }, [subjectFilter]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void api.get<{ documents: { id: string; title: string }[] }>('/api/documents').then((r) => setDocuments(r.documents)).catch(() => setDocuments([])); }, []);

  useEffect(() => {
    if (!newSubjectId) { setChapters([]); return; }
    void api.get<{ chapters: Chapter[] }>(`/api/subjects/${newSubjectId}/chapters`).then((r) => setChapters(r.chapters)).catch(() => setChapters([]));
  }, [newSubjectId]);

  const openCardModal = useCallback((c?: Card) => {
    setEditCard(c ?? null);
    setFront(c?.front ?? ''); setBack(c?.back ?? ''); setHint(c?.hint ?? '');
    setNewSubjectId(c?.subject_id ?? ''); setNewChapterId(c?.chapter_id ?? '');
    setCardModal(true);
  }, []);

  const saveCard = useCallback(async () => {
    if (!front.trim() || !back.trim()) return;
    try {
      const body = { front, back, hint: hint || null, subjectId: newSubjectId || null, chapterId: newChapterId || null };
      if (editCard) await api.patch(`/api/flashcards/${editCard.id}`, body);
      else await api.post('/api/flashcards', body);
      toast.show(editCard ? 'Kaart bijgewerkt.' : 'Kaart toegevoegd.', 'success');
      setCardModal(false);
      void load();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kon kaart niet opslaan.', 'error');
    }
  }, [front, back, hint, newSubjectId, newChapterId, editCard, toast, load]);

  const deleteCard = useCallback(async () => {
    if (!confirmDel) return;
    try {
      await api.del(`/api/flashcards/${confirmDel.id}`);
      toast.show('Kaart verwijderd.', 'success');
      setConfirmDel(null);
      void load();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kon kaart niet verwijderen.', 'error');
    }
  }, [confirmDel, toast, load]);

  const current = due[reviewIdx];

  const answerGrade = useCallback(async (grade: number) => {
    if (!current) return;
    try {
      await api.post('/api/flashcards/review', {
        cardId: current.id, grade,
        timeMs: Date.now() - sessionStart - reviewed * 4000,
        objectiveId: current.objectiveId
      });
      setReviewed((r) => r + 1);
      setRevealed(false);
      setReviewIdx((i) => i + 1);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kon review niet opslaan.', 'error');
    }
  }, [current, sessionStart, reviewed, toast]);

  const finishReview = useCallback(() => {
    setReviewOpen(false);
    toast.show(`${reviewed} kaarten herhaald. De volgende herhalingen staan ingepland.`, 'success');
    setReviewIdx(0); setReviewed(0); setRevealed(false);
    void load();
  }, [reviewed, toast, load]);

  const runGenerate = useCallback(async () => {
    setGenBusy(true);
    try {
      const r = await api.post<{ created: number }>('/api/flashcards/generate', {
        source: genSource, documentId: genDocId || null, subjectId: genSubjectId,
        chapterId: genChapterId || null, text: genText || undefined, count: genCount
      });
      toast.show(`${r.created} kaarten gemaakt door de AI.`, 'success');
      setGenOpen(false);
      void load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kon kaarten niet genereren.';
      toast.show(err instanceof Error && (err as Error & { configured?: boolean }).configured
        ? `${msg} Voeg MISTRAL_API_KEY toe om AI-generatie te gebruiken.` : msg,
        err instanceof Error && (err as Error & { configured?: boolean }).configured ? 'warning' : 'error');
    } finally {
      setGenBusy(false);
    }
  }, [genSource, genDocId, genSubjectId, genChapterId, genText, genCount, toast, load]);

  const reviewProgress = useMemo(() => (reviewOpen ? { done: reviewed, total: reviewed + Math.max(0, due.length - reviewIdx) } : null), [reviewOpen, reviewed, due.length, reviewIdx]);

  if (loading) return <Loading label="Flashcards laden…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="section-title">Flashcards</h1>
          <p className="muted text-sm">Spaced repetition: kaarten komen precies terug wanneer je ze op het randje van vergeten zit.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost" onClick={() => openCardModal()}>+ Nieuwe kaart</button>
          <button className="btn btn-soft" onClick={() => { setGenOpen(true); }}>✨ AI genereren</button>
          <button className="btn btn-primary" onClick={() => { setReviewOpen(true); setReviewIdx(0); setRevealed(false); }} disabled={!due.length}>
            ▶ Herhalen ({due.length} vervallen)
          </button>
        </div>
      </div>

      <Card className="flex flex-wrap items-center gap-3 py-3">
        <div className="stat-value">{cards.length}</div>
        <div className="stat-label">kaarten totaal</div>
        <div className="ml-auto flex items-center gap-2">
          <label className="label" htmlFor="fc-subj">Filter</label>
          <select id="fc-subj" className="input w-auto" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
            <option value="">Alle vakken</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </Card>

      {cards.length === 0 ? (
        <EmptyState icon="🃏" title="Nog geen flashcards" body="Maak zelf kaarten of laat de AI ze automatisch maken uit je documenten." action={<button className="btn btn-primary" onClick={() => setGenOpen(true)}>✨ AI genereren</button>} />
      ) : (
        <Card>
          <Tabs tabs={[{ id: 'mijn', label: 'Alle kaarten' }, { id: 'due', label: `Vervallen nu (${due.length})` }]} active={tab} onChange={setTab} />
          {tab === 'mijn' ? (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr><th>Voorkant</th><th>Achterkant</th><th>Vak</th><th>Herhalingen</th><th>Volgende</th><th /></tr>
                </thead>
                <tbody>
                  {cards.map((c) => (
                    <tr key={c.id}>
                      <td className="max-w-[260px] truncate font-medium">{c.front}</td>
                      <td className="max-w-[260px] truncate">{c.back}</td>
                      <td>{c.subjectName ?? '—'}</td>
                      <td>{c.reps ?? 0}×</td>
                      <td className="text-sm">{c.due_at && c.due_at > new Date().toISOString().replace(' ', 'T').slice(0, 19) ? c.due_at.slice(0, 10) : 'nu'}</td>
                      <td className="whitespace-nowrap">
                        <button className="btn btn-ghost text-xs" onClick={() => openCardModal(c)}>Bewerk</button>{' '}
                        <button className="btn btn-danger text-xs" onClick={() => setConfirmDel(c)}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ul className="divide-y divide-[rgb(var(--c-hairline))]">
              {due.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{d.front}</p>
                    <p className="muted text-xs">{d.state.reps} herhalingen · interval {d.state.interval_days}d</p>
                  </div>
                  <button className="btn btn-soft text-xs" onClick={() => { setReviewOpen(true); setReviewIdx(due.findIndex((x) => x.id === d.id)); setReviewed(0); setRevealed(false); }}>Oefen nu</button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* Review-sessie */}
      <Modal open={reviewOpen} onClose={finishReview} title={reviewProgress ? `Herhalen — ${reviewProgress.done}/${reviewProgress.total}` : 'Herhalen'} wide>
        {!current ? (
          <div className="space-y-4 text-center">
            <p className="text-lg font-semibold">Klaar! 🎉</p>
            <p className="muted text-sm">{reviewed} kaarten herhaald. Je volgende herhalingen zijn ingepland door het spaced-repetition-algoritme (SM-2).</p>
            <button className="btn btn-primary" onClick={finishReview}>Sluiten</button>
          </div>
        ) : (
          <div className="space-y-4">
            <ProgressBar value={reviewIdx} max={Math.max(1, due.length)} />
            <div className="card min-h-[160px] bg-[rgb(var(--c-surface2))] p-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--c-muted))]">Vraag</p>
              <p className="mb-1 whitespace-pre-wrap text-lg font-medium">{current.front}</p>
              {current.hint && <p className="muted mt-2 text-sm">💡 {current.hint}</p>}
              {revealed && (
                <div className="mt-4 border-t border-[rgb(var(--c-hairline))] pt-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--c-muted))]">Antwoord</p>
                  <p className="whitespace-pre-wrap">{current.back}</p>
                </div>
              )}
            </div>
            {revealed ? (
              <div className="flex flex-wrap gap-2">
                {GRADES.map((g) => (
                  <button key={g.grade} className={`chip ${g.grade >= 3 ? 'border-[rgb(var(--c-success))] text-[rgb(var(--c-success))]' : 'border-[rgb(var(--c-danger))] text-[rgb(var(--c-danger))]'}`} onClick={() => void answerGrade(g.grade)}>
                    {g.label} <span className="muted">· {g.hint}</span>
                  </button>
                ))}
              </div>
            ) : (
              <button className="btn btn-primary w-full" onClick={() => setRevealed(true)}>Toon antwoord</button>
            )}
          </div>
        )}
      </Modal>

      {/* Kaart-modal */}
      <Modal open={cardModal} onClose={() => setCardModal(false)} title={editCard ? 'Kaart bewerken' : 'Nieuwe kaart'}>
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="fc-front">Voorkant (vraag)</label>
            <textarea id="fc-front" className="input" rows={2} value={front} onChange={(e) => setFront(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="fc-back">Achterkant (antwoord)</label>
            <textarea id="fc-back" className="input" rows={3} value={back} onChange={(e) => setBack(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="fc-hint">Hint (optioneel)</label>
            <input id="fc-hint" className="input" value={hint} onChange={(e) => setHint(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="fc-subject">Vak</label>
            <select id="fc-subject" className="input" value={newSubjectId} onChange={(e) => setNewSubjectId(e.target.value)}>
              <option value="">Geen vak</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {newSubjectId && (
            <div>
              <label className="label" htmlFor="fc-chapter">Hoofdstuk</label>
              <select id="fc-chapter" className="input" value={newChapterId} onChange={(e) => setNewChapterId(e.target.value)}>
                <option value="">Geen hoofdstuk</option>
                {chapters.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setCardModal(false)}>Annuleer</button>
            <button className="btn btn-primary" onClick={() => void saveCard()} disabled={!front.trim() || !back.trim()}>Opslaan</button>
          </div>
        </div>
      </Modal>

      {/* Gen-modal */}
      <Modal open={genOpen} onClose={() => setGenOpen(false)} title="AI-flashcards genereren">
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="fc-gen-subject">Vak *</label>
            <select id="fc-gen-subject" className="input" value={genSubjectId} onChange={(e) => setGenSubjectId(e.target.value)}>
              <option value="">Kies een vak…</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="fc-gen-source">Bron</label>
            <select id="fc-gen-source" className="input" value={genSource} onChange={(e) => setGenSource(e.target.value as 'document' | 'subject' | 'text')}>
              <option value="document">Document</option>
              <option value="text">Geplakte tekst</option>
            </select>
          </div>
          {genSource === 'document' && (
            <div>
              <label className="label" htmlFor="fc-gen-doc">Document</label>
              <select id="fc-gen-doc" className="input" value={genDocId} onChange={(e) => setGenDocId(e.target.value)}>
                <option value="">Kies een document…</option>
                {documents.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            </div>
          )}
          {genSource === 'text' && (
            <div>
              <label className="label" htmlFor="fc-gen-text">Tekst</label>
              <textarea id="fc-gen-text" className="input" rows={6} value={genText} onChange={(e) => setGenText(e.target.value)} placeholder="Plak hier de leerstof…" />
            </div>
          )}
          <div>
            <label className="label" htmlFor="fc-gen-count">Aantal kaarten: {genCount}</label>
            <input id="fc-gen-count" type="range" min={5} max={60} value={genCount} onChange={(e) => setGenCount(Number(e.target.value))} className="w-full" />
          </div>
          <p className="muted text-xs">⚠️ AI-flashcards vereisen MISTRAL_API_KEY op de server. Zonder key is generatie niet beschikbaar.</p>
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setGenOpen(false)}>Annuleer</button>
            <button className="btn btn-primary" onClick={() => void runGenerate()} disabled={genBusy || !genSubjectId || (genSource === 'document' ? !genDocId : genSource === 'text' ? !genText.trim() : false)}>
              {genBusy ? 'Genereren…' : 'Genereren'}
            </button>
          </div>
        </div>
      </Modal>

      <Confirm open={!!confirmDel} message={`Kaart "${confirmDel?.front ?? ''}" verwijderen? Dit kan niet ongedaan gemaakt worden.`} onCancel={() => setConfirmDel(null)} onConfirm={() => void deleteCard()} />
    </div>
  );
}
