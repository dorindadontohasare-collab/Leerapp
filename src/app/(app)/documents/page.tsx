'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, SUMMARY_KINDS, type DocumentItem, type Subject } from '@/lib/fetcher';
import { Card, Modal, EmptyState, Loading, ErrorState, ProgressBar, useToast, Confirm, Spinner } from '@/components/ui';

type DocDetail = DocumentItem & {
  text: string;
  analysis?: Record<string, unknown> | null;
  error?: string | null;
  subject_id: string | null;
  created_at: string;
  summaries: { id: string; kind: string; title: string; content: string; created_at: string }[];
};

const ANALYSIS_LABELS: Record<string, string> = {
  none: 'Nog niet geanalyseerd',
  pending: 'Analyse bezig…',
  done: 'Analyse compleet',
  error: 'Analyse mislukt'
};

export default function DocumentsPage() {
  const params = useSearchParams();
  const toast = useToast();
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadOpen, setUploadOpen] = useState(params.get('upload') === '1');
  const [openId, setOpenId] = useState<string | null>(params.get('open'));
  const [detail, setDetail] = useState<DocDetail | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const filterSubject = params.get('subject') ?? '';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [d, s] = await Promise.all([
        api.get<{ documents: DocumentItem[] }>(`/api/documents${filterSubject ? `?subjectId=${filterSubject}` : ''}`),
        api.get<{ subjects: Subject[] }>('/api/subjects')
      ]);
      setDocs(d.documents);
      setSubjects(s.subjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kon documenten niet laden.');
    } finally {
      setLoading(false);
    }
  }, [filterSubject]);

  useEffect(() => { void load(); }, [load]);

  const openDoc = useCallback(async (id: string) => {
    setOpenId(id);
    setDetail(null);
    try {
      const r = await api.get<DocDetail>(`/api/documents/${id}`);
      setDetail(r);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Kon document niet openen', 'error');
    }
  }, [toast]);

  useEffect(() => { if (openId) void openDoc(openId); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [openId]);

  async function analyze(id: string) {
    toast.push('Document wordt geanalyseerd… Dit kan tot enkele minuten duren.');
    try {
      const r = await api.post(`/api/documents/${id}/analyze`);
      toast.push('Analyse voltooid ✅', 'success');
      await openDoc(id);
      void load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Analyse mislukt';
      toast.push(msg, e instanceof Error && 'configured' in e ? 'info' : 'error');
    }
  }

  const list = docs;

  return (
    <div className="space-y-6 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Documenten</h1>
          <p className="muted">Upload cursusmateriaal en laat de AI structuur, begrippen en leerdoelen extraheren.</p>
        </div>
        <button className="btn-primary" onClick={() => setUploadOpen(true)}>+ Document toevoegen</button>
      </div>

      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : (
        list && list.length === 0 ? (
          <EmptyState
            icon="📄"
            title="Nog geen documenten"
            body="Upload een PDF, Word-, PowerPoint- of tekstbestand, plak tekst of voeg een link toe. Scans worden automatisch ge-OCR'd (vereist AI-configuratie)."
            action={<button className="btn-primary" onClick={() => setUploadOpen(true)}>+ Document toevoegen</button>}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {list.map((d) => (
              <Card key={d.id} className="flex cursor-pointer flex-col gap-2 transition-transform hover:-translate-y-0.5" onClick={() => void openDoc(d.id)}>
                <div className="flex items-center gap-2">
                  <span className="text-xl" aria-hidden="true">{kindIcon(d.kind)}</span>
                  <p className="min-w-0 flex-1 truncate font-bold text-ink">{d.title}</p>
                </div>
                <p className="text-xs text-muted">{d.subjectName ?? 'Zonder vak'} · {new Date(d.created_at).toLocaleDateString('nl-NL')}</p>
                <div className="flex items-center gap-2">
                  <span className={`chip ${d.analysis_status === 'done' ? 'bg-pastelpink text-ink-2' : d.analysis_status === 'error' ? 'bg-pastelpink' : 'bg-softblue'}`}>{ANALYSIS_LABELS[d.analysis_status] ?? d.analysis_status}</span>
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      <UploadModal open={uploadOpen} subjects={subjects.map((s) => ({ id: s.id, name: s.name }))} onClose={() => setUploadOpen(false)} onUploaded={async (id) => { setUploadOpen(false); void load(); void openDoc(id); }} />

      {/* Detail-overlay */}
      {openId && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/40 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenId(null); }}>
          <div className="mx-auto my-8 w-full max-w-4xl px-4 slide-up" role="dialog" aria-modal="true">
            <div className="card p-6">
              {!detail ? <Loading label="Document laden…" /> : (
                <>
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-extrabold text-ink">{detail.title}</h2>
                      <p className="text-xs text-muted">{kindIcon(detail.kind)} {detail.kind.toUpperCase()} · {detail.subjectName ?? 'zonder vak'} · {ANALYSIS_LABELS[detail.analysis_status]}</p>
                    </div>
                    <button className="btn-ghost" onClick={() => setOpenId(null)}>Sluiten ✕</button>
                  </div>

                  <div className="mb-4 flex flex-wrap gap-2">
                    {detail.analysis_status !== 'done' && <button className="btn-soft" onClick={() => void analyze(detail.id)}>🔍 AI-analyse starten</button>}
                    <Link className="btn-ghost" href={`/quizzes?subject=${detail.subject_id ?? ''}&generate=1`}>✨ Quiz op basis van dit document</Link>
                    <Link className="btn-ghost" href={`/flashcards?document=${detail.id}`}>🃏 Flashcards genereren</Link>
                    {detail.kind !== 'text' && <a className="btn-ghost" href={`/api/documents/${detail.id}/file`} target="_blank" rel="noreferrer">⬇️ Origineel openen</a>}
                    <button className="btn-danger" onClick={() => setConfirmId(detail.id)}>🗑️ Verwijderen</button>
                  </div>

                  <AnalysisPanel detail={detail} />
                  <SummariesPanel detail={detail} onChanged={() => void openDoc(detail.id)} />
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <Confirm
        open={!!confirmId}
        message="Dit document definitief verwijderen (inclusief analyselresultaten)?"
        onCancel={() => setConfirmId(null)}
        onConfirm={async () => {
          try { await api.del(`/api/documents/${confirmId}`); toast.push('Document verwijderd', 'success'); setConfirmId(null); setOpenId(null); void load(); }
          catch { toast.push('Verwijderen mislukt', 'error'); }
        }}
      />
    </div>
  );
}

function kindIcon(kind: string): string {
  if (kind === 'pdf') return '📕';
  if (kind === 'docx' || kind === 'doc') return '📘';
  if (kind === 'pptx' || kind === 'ppt') return '📙';
  if (kind === 'image') return '🖼️';
  if (kind === 'youtube') return '📺';
  if (kind === 'url') return '🔗';
  if (kind === 'csv') return '📊';
  return '📃';
}

function AnalysisPanel({ detail }: { detail: DocDetail }) {
  const a = detail.analysis as {
    summary?: string;
    chapters?: { title: string; objectives?: string[] }[] | null;
    keyTerms?: { term: string; definition: string }[] | null;
    importantFormulas?: string[] | null;
    exercisesFound?: number | null;
    completeness?: { missing?: string[]; unclearPassages?: string[]; chartsOrTablesNotParseable?: string[] } | null;
    suggestedObjectives?: string[] | null;
  } | null | undefined;

  if (!a) {
    return (
      <Card className="mb-4">
        <p className="text-sm text-muted">
          {detail.analysis_status === 'done' ? 'Geen analysegegevens beschikbaar.' : 'De AI-analyse herkent structuur, begrippen, formules en leerdoelen, en controleert op ontbrekende informatie.'}
        </p>
      </Card>
    );
  }
  return (
    <Card className="mb-4 space-y-4">
      <h3 className="section-title">AI-analyse</h3>
      {a.summary && <p className="text-sm text-ink2">{a.summary}</p>}
      {Array.isArray(a.chapters) && a.chapters.length > 0 && (
        <div>
          <p className="stat-label mb-1">Herkende structuur</p>
          <ul className="space-y-1 text-sm text-ink2">
            {a.chapters.map((c, i) => (
              <li key={i}>📘 <b>{c.title}</b>{c.objectives?.length ? (': ' + c.objectives.slice(0, 4).join(', ') + (c.objectives.length > 4 ? '…' : '')) : ''}</li>
            ))}
          </ul>
        </div>
      )}
      {Array.isArray(a.keyTerms) && a.keyTerms.length > 0 && (
        <div>
          <p className="stat-label mb-1">Belangrijke begrippen</p>
          <div className="flex flex-wrap gap-1.5">
            {a.keyTerms.map((t, i) => (
              <span key={i} className="chip bg-softblue" title={t.definition}>{t.term}</span>
            ))}
          </div>
        </div>
      )}
      {a.completeness && (
        <div className="rounded-xl border border-hairline bg-surface2 p-3 text-sm">
          <p className="stat-label mb-2">Volledigheidscontrole</p>
          {(a.completeness.missing ?? []).length === 0 && !(a.completeness.unclearPassages ?? []).length ? (
            <p className="text-ink2">Geen ontbrekende informatie gedetecteerd in dit document. Verzin nooit ontbrekende inhoud — wat de AI niet kon lezen, staat hieronder expliciet vermeld.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-ink2">
              {(a.completeness.missing ?? []).map((m, i) => <li key={'m' + i}>{m}</li>)}
              {(a.completeness.unclearPassages ?? []).map((m, i) => <li key={'u' + i}>Onduidelijk: {m}</li>)}
              {(a.completeness.chartsOrTablesNotParseable ?? []).map((m, i) => <li key={'t' + i}>Niet uitgelezen: {m}</li>)}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

function SummariesPanel({ detail, onChanged }: { detail: DocDetail; onChanged: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState('brief');
  const [detailLevel, setDetailLevel] = useState('normaal');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);

  const generate = async () => {
    setBusy(true);
    try {
      await api.post(`/api/documents/${detail.id}/summarize`, { kind, detail: detailLevel });
      toast.push('Samenvatting gegenereerd', 'success');
      onChanged();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Genereren mislukt', 'error');
    } finally { setBusy(false); }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await api.patch(`/api/summaries/${editing.id}`, { content: editing.content });
      toast.push('Samenvatting opgeslagen', 'success');
      setEditing(null);
      onChanged();
    } catch { toast.push('Opslaan mislukt', 'error'); }
  };

  return (
    <Card className="space-y-4">
      <h3 className="section-title">AI-samenvattingen</h3>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-52 flex-1">
          <label className="label" htmlFor="sum-kind">Soort</label>
          <select id="sum-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {SUMMARY_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="sum-detail">Uitgebreidheid</label>
          <select id="sum-detail" className="input" value={detailLevel} onChange={(e) => setDetailLevel(e.target.value)}>
            <option value="kort">Kort</option>
            <option value="normaal">Normaal</option>
            <option value="uitgebreid">Uitgebreid met uitleg</option>
          </select>
        </div>
        <button className="btn-primary" onClick={generate} disabled={busy}>{busy ? <Spinner size={15} /> : 'Genereren'}</button>
      </div>
      {detail.summaries?.length === 0 && <p className="muted">Nog geen samenvattingen. Kies een soort en genereer de eerste.</p>}
      <div className="space-y-2">
        {detail.summaries.map((s) => (
          <details key={s.id} className="rounded-xl border border-hairline p-3">
            <summary className="cursor-pointer text-sm font-bold text-ink">{s.title}</summary>
            {editing?.id === s.id ? (
              <div className="mt-2 space-y-2">
                <textarea className="input min-h-40" value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} />
                <div className="flex gap-2"><button className="btn-soft" onClick={saveEdit}>Opslaan</button><button className="btn-ghost" onClick={() => setEditing(null)}>Annuleren</button></div>
              </div>
            ) : (
              <div className="mt-2 whitespace-pre-wrap text-sm text-ink2">{s.content}</div>
            )}
            {editing?.id !== s.id && <button className="mt-2 text-xs font-semibold link" onClick={() => setEditing({ id: s.id, content: s.content })}>✎ Bewerken</button>}
          </details>
        ))}
      </div>
    </Card>
  );
}

function UploadModal({ open, subjects, onClose, onUploaded }: { open: boolean; subjects: { id: string; name: string }[]; onClose: () => void; onUploaded: (id: string) => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'file' | 'text' | 'url'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  useEffect(() => { setSubjectId(subjects[0]?.id ?? ''); }, [subjects, open]);

  const submit = async () => {
    setBusy(true); setProgress('');
    try {
      const form = new FormData();
      if (tab === 'file') {
        if (!file) return;
        form.set('mode', 'file');
        form.set('file', file);
        if (title) form.set('title', title);
      } else if (tab === 'text') {
        if (!text.trim()) return;
        form.set('mode', 'text');
        form.set('text', text);
        form.set('title', title || 'Geplakte tekst');
      } else {
        if (!url.trim()) return;
        form.set('mode', 'url');
        form.set('url', url);
        form.set('title', title.trim());
      }
      if (subjectId) form.set('subjectId', subjectId);
      if (tab === 'file' && file && file.type === 'application/pdf') setProgress('Bestand wordt verwerkt…');
      const r = await api.upload<{ id: string; kind: string }>('/api/documents', form);
      toast.push('Document toegevoegd ✅', 'success');
      setFile(null); setText(''); setUrl(''); setTitle('');
      if (fileRef.current) fileRef.current.value = '';
      onUploaded(r.id);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Uploaden mislukt', 'error');
    } finally { setBusy(false); setProgress(''); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Document toevoegen">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-hairline bg-surface2 p-1">
          {([['file', '📁 Bestand'], ['text', '📋 Tekst plakken'], ['url', '🔗 Link / YouTube']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`rounded-lg px-2 py-1.5 text-xs font-semibold ${tab === id ? 'bg-surface shadow-card' : 'text-muted'}`}>{label}</button>
          ))}
        </div>

        {tab === 'file' ? (
          <label
            className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-hairline px-6 py-10 text-center transition-colors hover:border-accentblue hover:bg-softblue/30"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
          >
            <input ref={fileRef} type="file" className="sr-only" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.csv,.json,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {file ? <span className="font-bold text-ink">{file.name} ({Math.round(file.size / 1024)} kB)</span> : (
              <>
                <span className="text-3xl" aria-hidden="true">⬆️</span>
                <span className="text-sm font-semibold text-ink">Sleep een bestand hier of klik om te kiezen</span>
                <span className="text-xs text-muted">PDF, DOCX, DOC, PPTX, PPT, TXT, MD, CSV, JSON, afbeeldingen (OCR) · max 40 MB</span>
              </>
            )}
          </label>
        ) : tab === 'text' ? (
          <textarea className="input min-h-40" placeholder="Plak hier je leerstof, quizopgaven of notities…" value={text} onChange={(e) => setText(e.target.value)} />
        ) : (
          <div className="space-y-2">
            <input className="input" placeholder="https://www.youtube.com/watch?v=… of https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
            <p className="text-xs text-muted">Van een YouTube-link wordt de beschikbare metadata en ondertitelingsinformatie geregistreerd; van een gewone webpagina wordt de tekst gelezen.</p>
          </div>
        )}

        {tab !== 'text' && <div><label className="label" htmlFor="up-title">Titel (optioneel)</label><input id="up-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Automatisch uit bestandsnaam of pagina" /></div>}
        <div>
          <label className="label" htmlFor="up-subject">Vak</label>
          <select id="up-subject" className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Zonder vak</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {progress && <p className="text-xs text-muted">{progress}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn-primary" onClick={submit} disabled={busy || (tab === 'file' ? !file : tab === 'text' ? !text.trim() : !url.trim())}>
            {busy ? <Spinner size={15} /> : 'Toevoegen'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
