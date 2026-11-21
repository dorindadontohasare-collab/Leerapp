'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, STATUS_LABELS, STATUS_COLORS, type Subject, type Chapter, type Objective } from '@/lib/fetcher';
import { Card, Modal, EmptyState, Loading, ErrorState, ProgressBar, useToast, Confirm } from '@/components/ui';

type Deck = {
  subjects: (Subject & { chapterCount: number; documentCount: number; quizCount: number; objectiveCount: number; avgMastery: number })[];
  chapters: (Chapter & { objectiveCount: number })[];
  objectives: Objective[];
  notes: { id: string; subject_id: string | null; chapter_id: string | null; title: string }[];
};

type NestedSubject = Omit<Subject, 'chapters'> & {
  chapters: (Chapter & { objectiveCount: number; objectives?: Objective[] })[];
  notes: { id: string; title: string }[];
  documentCount: number;
  quizCount: number;
  objectiveCount: number;
  avgMastery: number;
};

export default function LearnPage() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [nested, setNested] = useState<NestedSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [subjectModal, setSubjectModal] = useState<{ open: boolean; edit?: Subject }>({ open: false });
  const [chapterModal, setChapterModal] = useState<{ open: boolean; subjectId?: string; edit?: Chapter }>({ open: false });
  const [objectiveModal, setObjectiveModal] = useState<{ open: boolean; chapterId?: string; edit?: Objective }>({ open: false });
  const [noteModal, setNoteModal] = useState<{ open: boolean; subjectId?: string }>({ open: false });
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [openSubjectId, setOpenSubjectId] = useState<string | null>(params.get('subject'));

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await api.get<Deck>('/api/deck');
      setDeck(r);
      const nested: NestedSubject[] = r.subjects.map((sub) => ({
        ...sub,
        chapters: r.chapters.filter((c) => c.subject_id === sub.id).map((c) => ({
          ...c,
          objectives: r.objectives.filter((o) => o.chapter_id === c.id).sort((a, b) => a.position - b.position)
        })),
        notes: r.notes.filter((n) => n.subject_id === sub.id)
      }));
      setNested(nested);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kon de leeromgeving niet laden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const objectiveDeepLink = params.get('objective');
  const chapterDeepLink = params.get('chapter');

  async function refresh() { await load(); }

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  const subjects = nested;

  return (
    <div className="space-y-6 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Mijn leeromgeving</h1>
          <p className="muted">Vakken → Hoofdstukken → Leerdoelen, met beheersingsstatus per leerdoel.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setNoteModal({ open: true, subjectId: subjects[0]?.id })}>📝 Notitie</button>
          <button className="btn-primary" onClick={() => setSubjectModal({ open: true })}>+ Vak aanmaken</button>
        </div>
      </div>

      {subjects.length === 0 ? (
        <EmptyState
          icon="📚"
          title="Nog geen vakken"
          body="Maak je eerste vak aan. Upload daarna documenten, laat de AI hoofdstukken en leerdoelen voorstellen, en begin je leertraject."
          action={<button className="btn-primary" onClick={() => setSubjectModal({ open: true })}>+ Vak aanmaken</button>}
        />
      ) : (
        <div className="space-y-4">
          {subjects.map((s) => (
            <Card key={s.id} className={openSubjectId === s.id ? 'border-accentblue/60' : ''}>
              <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpenSubjectId(openSubjectId === s.id ? null : s.id)}>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl text-lg" style={{ backgroundColor: s.color }} aria-hidden="true">📚</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-ink">{s.name}</p>
                  <p className="truncate text-xs text-muted">{s.chapters?.length ?? 0} hoofdstukken · {s.objectiveCount ?? 0} leerdoelen · {s.documentCount ?? 0} documenten · {s.quizCount ?? 0} quizzen</p>
                </div>
                <div className="hidden w-40 items-center gap-2 sm:flex">
                  <ProgressBar value={s.avgMastery ?? 0} color={s.color} />
                  <span className="text-xs font-bold text-ink2">{Math.round(s.avgMastery ?? 0)}%</span>
                </div>
                <span className="text-muted" aria-hidden="true">{openSubjectId === s.id ? '▾' : '▸'}</span>
              </button>

              {openSubjectId === s.id && (
                <div className="mt-4 space-y-3 fade-in">
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setChapterModal({ open: true, subjectId: s.id })}>+ Hoofdstuk</button>
                    <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setSubjectModal({ open: true, edit: s })}>Bewerken</button>
                    <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setConfirmId(s.id)}>Verwijderen</button>
                    <Link className="btn-ghost px-3 py-1.5 text-xs" href={`/documents?subject=${s.id}`}>Documenten</Link>
                    <Link className="btn-ghost px-3 py-1.5 text-xs" href={`/quizzes?subject=${s.id}`}>Quizzen</Link>
                    <Link className="btn-ghost px-3 py-1.5 text-xs" href={`/coach?subject=${s.id}`}>Overhoren</Link>
                  </div>

                  {(s.chapters ?? []).length === 0 && <p className="muted">Nog geen hoofdstukken. Analyseer een document of maak er zelf één.</p>}

                  {(s.chapters ?? []).map((c) => (
                    <div key={c.id} id={`chapter-${c.id}`} className={`rounded-xl border border-hairline p-3 ${chapterDeepLink === c.id ? 'border-accentblue' : ''}`}>
                      <div className="flex items-center gap-2">
                        <p className="flex-1 font-semibold text-ink">{c.title}</p>
                        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setObjectiveModal({ open: true, chapterId: c.id })}>+ Leerdoel</button>
                        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setChapterModal({ open: true, subjectId: s.id, edit: c })}>Bewerken</button>
                      </div>
                      {c.summary && <p className="mb-2 text-xs text-muted">{c.summary}</p>}
                      <div className="mt-2 space-y-1.5">
                        {(c.objectives ?? []).length === 0 && <p className="text-xs text-muted">Nog geen leerdoelen.</p>}
                        {(c.objectives ?? []).map((o) => (
                          <div key={o.id} id={`objective-${o.id}`} className={`flex flex-wrap items-center gap-2 rounded-lg border border-hairline px-3 py-2 ${objectiveDeepLink === o.id ? 'border-accentblue' : ''}`}>
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[o.status] }} aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate text-sm text-ink2">{o.title}</span>
                            <span className="chip" style={{ backgroundColor: STATUS_COLORS[o.status] }}>{STATUS_LABELS[o.status]}</span>
                            <span className="text-xs font-bold text-ink2">{Math.round(o.mastery_score)}%</span>
                            <button className="text-xs text-muted hover:text-ink" onClick={() => setObjectiveModal({ open: true, chapterId: c.id, edit: o })} aria-label={`Leerdoel ${o.title} bewerken`}>✎</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {(s.notes ?? []).length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Notities</p>
                      {(s.notes ?? []).map((n) => (
                        <div key={n.id} className="rounded-lg border border-hairline px-3 py-2 text-sm font-semibold text-ink2">{n.title}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <SubjectModal
        open={subjectModal.open}
        edit={subjectModal.edit}
        onClose={() => setSubjectModal({ open: false })}
        onSaved={() => { setSubjectModal({ open: false }); toast.push('Vak opgeslagen', 'success'); void refresh(); }}
      />
      <ChapterModal
        open={chapterModal.open}
        subjectId={chapterModal.subjectId}
        edit={chapterModal.edit}
        onClose={() => setChapterModal({ open: false })}
        onSaved={() => { setChapterModal({ open: false }); toast.push('Hoofdstuk opgeslagen', 'success'); void refresh(); }}
      />
      <ObjectiveModal
        open={objectiveModal.open}
        chapterId={objectiveModal.chapterId}
        edit={objectiveModal.edit}
        onClose={() => setObjectiveModal({ open: false })}
        onSaved={() => { setObjectiveModal({ open: false }); toast.push('Leerdoel opgeslagen', 'success'); void refresh(); }}
      />
      {/* Notitie-modal */}
      <NoteModal open={noteModal.open} subjects={subjects.map((s) => ({ id: s.id, name: s.name }))} defaultSubject={noteModal.subjectId} onClose={() => setNoteModal({ open: false })} onSaved={() => { setNoteModal({ open: false }); toast.push('Notitie opgeslagen', 'success'); void refresh(); }} />

      <Confirm
        open={!!confirmId}
        message="Dit vak inclusief hoofdstukken, leerdoelen en documentkoppelingen verwijderen? Deze actie kan niet ongedaan gemaakt worden."
        onCancel={() => setConfirmId(null)}
        onConfirm={async () => {
          try { await api.del(`/api/subjects/${confirmId}`); toast.push('Vak verwijderd', 'success'); setConfirmId(null); void refresh(); }
          catch { toast.push('Verwijderen mislukt', 'error'); }
        }}
      />
    </div>
  );
}

function SubjectModal({ open, edit, onClose, onSaved }: { open: boolean; edit?: Subject; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#A9C9ED');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName(edit?.name ?? '');
    setColor(edit?.color ?? ['#A9C9ED', '#F7E5A4', '#F3C9D8', '#DCEBFA', '#9FD8CB'][Math.floor(Math.random() * 5)]);
    setDescription(edit?.description ?? '');
  }, [edit, open]);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (edit) await api.patch(`/api/subjects/${edit.id}`, { name, color, description });
      else await api.post('/api/subjects', { name, color, description });
      onSaved();
    } catch (e) { alert(e instanceof Error ? e.message : 'Opslaan mislukt'); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={edit ? 'Vak bewerken' : 'Nieuw vak'}>
      <div className="space-y-3">
        <div><label className="label" htmlFor="s-name">Naam</label><input id="s-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div>
          <label className="label">Kleur</label>
          <div className="flex gap-2">
            {['#A9C9ED', '#DCEBFA', '#F7E5A4', '#F3C9D8', '#9FD8CB', '#B9A9ED'].map((c) => (
              <button key={c} onClick={() => setColor(c)} aria-label={`Kleur ${c}`} className={`h-8 w-8 rounded-full border-2 ${color === c ? 'border-ink' : 'border-transparent'}`} style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
        <div><label className="label" htmlFor="s-desc">Beschrijving</label><textarea id="s-desc" className="input min-h-16" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="flex justify-end gap-2 pt-2"><button className="btn-ghost" onClick={onClose}>Annuleren</button><button className="btn-primary" onClick={save} disabled={busy || !name.trim()}>Opslaan</button></div>
      </div>
    </Modal>
  );
}

function ChapterModal({ open, subjectId, edit, onClose, onSaved }: { open: boolean; subjectId?: string; edit?: Chapter; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTitle(edit?.title ?? ''); setSummary(edit?.summary ?? ''); }, [edit, open]);

  const save = async () => {
    if (!title.trim() || !subjectId) return;
    setBusy(true);
    try {
      if (edit) await api.patch(`/api/chapters/${edit.id}`, { title, summary });
      else await api.post(`/api/subjects/${subjectId}/chapters`, { title, summary });
      onSaved();
    } catch (e) { alert(e instanceof Error ? e.message : 'Opslaan mislukt'); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={edit ? 'Hoofdstuk bewerken' : 'Nieuw hoofdstuk'}>
      <div className="space-y-3">
        <div><label className="label" htmlFor="c-title">Titel</label><input id="c-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><label className="label" htmlFor="c-sum">Korte samenvatting</label><textarea id="c-sum" className="input min-h-16" value={summary} onChange={(e) => setSummary(e.target.value)} /></div>
        <div className="flex justify-end gap-2 pt-2"><button className="btn-ghost" onClick={onClose}>Annuleren</button><button className="btn-primary" onClick={save} disabled={busy || !title.trim()}>Opslaan</button></div>
      </div>
    </Modal>
  );
}

function ObjectiveModal({ open, chapterId, edit, onClose, onSaved }: { open: boolean; chapterId?: string; edit?: Objective; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTitle(edit?.title ?? ''); setDescription(edit?.description ?? ''); }, [edit, open]);

  const save = async () => {
    if (!title.trim() || !chapterId) return;
    setBusy(true);
    try {
      if (edit) await api.patch(`/api/objectives/${edit.id}`, { title, description });
      else await api.post('/api/objectives', { chapterId, title, description });
      onSaved();
    } catch (e) { alert(e instanceof Error ? e.message : 'Opslaan mislukt'); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={edit ? 'Leerdoel bewerken' : 'Nieuw leerdoel'}>
      <div className="space-y-3">
        <div><label className="label" htmlFor="o-title">Titel</label><input id="o-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><label className="label" htmlFor="o-desc">Beschrijving</label><textarea id="o-desc" className="input min-h-16" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="flex justify-end gap-2 pt-2"><button className="btn-ghost" onClick={onClose}>Annuleren</button><button className="btn-primary" onClick={save} disabled={busy || !title.trim()}>Opslaan</button></div>
      </div>
    </Modal>
  );
}

function NoteModal({ open, subjects, defaultSubject, onClose, onSaved }: { open: boolean; subjects: { id: string; name: string }[]; defaultSubject?: string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTitle(''); setBody(''); setSubjectId(defaultSubject ?? subjects[0]?.id ?? ''); }, [defaultSubject, subjects, open]);

  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.post('/api/notes', { title, body, subjectId: subjectId || null });
      onSaved();
    } catch (e) { alert(e instanceof Error ? e.message : 'Opslaan mislukt'); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nieuwe notitie">
      <div className="space-y-3">
        <div><label className="label" htmlFor="n-title">Titel</label><input id="n-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div>
          <label className="label" htmlFor="n-sub">Vak</label>
          <select id="n-sub" className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Geen vak</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div><label className="label" htmlFor="n-body">Inhoud</label><textarea id="n-body" className="input min-h-32" value={body} onChange={(e) => setBody(e.target.value)} /></div>
        <div className="flex justify-end gap-2 pt-2"><button className="btn-ghost" onClick={onClose}>Annuleren</button><button className="btn-primary" onClick={save} disabled={busy || !title.trim()}>Opslaan</button></div>
      </div>
    </Modal>
  );
}
