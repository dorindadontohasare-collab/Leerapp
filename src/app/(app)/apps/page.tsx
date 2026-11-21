'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, type Subject } from '@/lib/fetcher';
import { Card, Modal, EmptyState, Loading, ErrorState, useToast, Confirm } from '@/components/ui';

type AppItem = {
  id: string; title: string; description: string | null; kind: string; folder: string;
  integration: string; subject_id: string | null; subjectName?: string | null;
  last_used_at: string | null; resultCount: number; analysis_status: string;
};

export default function AppsPage() {
  const params = useSearchParams();
  const toast = useToast();
  const [apps, setApps] = useState<AppItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importOpen, setImportOpen] = useState(params.get('import') === '1');
  const [openId, setOpenId] = useState<string | null>(params.get('open'));
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [a, s] = await Promise.all([
        api.get<{ apps: AppItem[] }>('/api/apps'),
        api.get<{ subjects: Subject[] }>('/api/subjects')
      ]);
      setApps(a.apps); setSubjects(s.subjects);
      if (openId && openId !== '1') { /* deep-link geopend via runner */ }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kon apps niet laden.');
    } finally { setLoading(false); }
  }, [openId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Mijn apps</h1>
          <p className="muted">Importeer zelfgemaakte leerapps (HTML, ZIP, JSON of URL) en voer ze veilig uit in een sandbox.</p>
        </div>
        <button className="btn-primary" onClick={() => setImportOpen(true)}>+ App toevoegen</button>
      </div>

      <Card className="text-xs text-muted">
        <b>Ondersteunde formaten:</b> .html-bestand, .zip met een volledige webapp (met index.html), .json-export of een https-URL.
        Apps draaien in een geïsoleerd iframe zonder toegang tot je account of documenten. Apps die de <b>StudyBase Integratie-API v1.0</b> gebruiken
        (via <code>window.StudyBase</code>) kunnen resultaten automatisch doorsturen; anders kun je resultaten handmatig invoeren.
      </Card>

      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : apps.length === 0 ? (
        <EmptyState
          icon="🧱"
          title="Nog geen apps"
          body="Voeg een HTML-leerapp of ZIP-project toe, of koppel een openbare https-URL. De AI analyseert wat de app bevat en detecteert integratiecapaciteiten."
          action={<button className="btn-primary" onClick={() => setImportOpen(true)}>+ App toevoegen</button>}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {apps.map((a) => (
            <Card key={a.id} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold text-ink">{a.title}</p>
                  <p className="truncate text-xs text-muted">{a.subjectName ?? 'Zonder vak'} · {a.kind.toUpperCase()}{a.folder ? ` · 📁 ${a.folder}` : ''}</p>
                </div>
                <span className={`chip ${a.integration === 'protocol_supported' ? 'bg-success/20' : 'bg-softblue'}`} title={a.integration === 'protocol_supported' ? 'Ondersteunt StudyBase Integratie-API' : 'Alleen openen; resultaten handmatig of via analyse'}>
                  {a.integration === 'protocol_supported' ? '🔗 Geïntegreerd' : '🚪 Alleen openen'}
                </span>
              </div>
              {a.description && <p className="line-clamp-2 text-xs text-ink2">{a.description}</p>}
              <p className="text-xs text-muted">{a.resultCount} resultaten · {a.last_used_at ? `laatst gebruikt ${new Date(a.last_used_at).toLocaleDateString('nl-NL')}` : 'nog niet gebruikt'}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <Link href={`/apps/${a.id}`} className="btn-primary px-3 py-1.5 text-xs">Openen ▶</Link>
                <button className="btn-ghost px-2 py-1.5 text-xs" onClick={async () => { try { await api.post(`/api/apps/${a.id}/analyze`); toast.push('App opnieuw geanalyseerd', 'success'); void load(); } catch { toast.push('Analyse mislukt', 'error'); } }}>↻ Analyse</button>
                <button className="btn-ghost px-2 py-1.5 text-xs" onClick={async () => { try { await api.post(`/api/apps/${a.id}/duplicate`); toast.push('App gedupliceerd', 'success'); void load(); } catch { toast.push('Dupliceren mislukt', 'error'); } }}>⧉</button>
                <button className="btn-ghost px-2 py-1.5 text-xs text-danger" onClick={() => setConfirmId(a.id)}>🗑️</button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ImportAppModal open={importOpen} subjects={subjects.map((s) => ({ id: s.id, name: s.name }))} onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); void load(); }} />

      <Confirm open={!!confirmId} message="Deze app en de bijbehorende bestanden definitief verwijderen?" onCancel={() => setConfirmId(null)} onConfirm={async () => {
        try { await api.del(`/api/apps/${confirmId}`); toast.push('App verwijderd', 'success'); setConfirmId(null); void load(); }
        catch { toast.push('Verwijderen mislukt', 'error'); }
      }} />
    </div>
  );
}

function ImportAppModal({ open, subjects, onClose, onDone }: { open: boolean; subjects: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [tab, setTab] = useState<'file' | 'url'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const form = new FormData();
      if (tab === 'file') {
        if (!file) return;
        form.set('mode', 'file'); form.set('file', file);
        if (title) form.set('title', title);
        if (description) form.set('description', description);
      } else {
        if (!url.trim()) return;
        form.set('mode', 'url'); form.set('url', url);
        if (title) form.set('title', title);
        if (description) form.set('description', description);
      }
      if (subjectId) form.set('subjectId', subjectId);
      await api.upload('/api/apps', form);
      toast.push('App geïmporteerd ✅ Analyse en integratiestatus zijn bijgewerkt.', 'success');
      setFile(null); setUrl(''); setTitle(''); setDescription('');
      onDone();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Importeren mislukt', 'error');
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Leerapp importeren" wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-hairline bg-surface2 p-1">
          {([['file', '📁 Upload bestand'], ['url', '🔗 Openbare https-URL']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`rounded-lg px-2 py-1.5 text-xs font-semibold ${tab === id ? 'bg-surface shadow-card' : 'text-muted'}`}>{label}</button>
          ))}
        </div>
        {tab === 'file' ? (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-hairline px-6 py-8 text-center hover:border-accentblue hover:bg-softblue/30" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}>
            {file ? <span className="font-bold text-ink">{file.name}</span> : (
              <>
                <span className="text-3xl" aria-hidden="true">🧱</span>
                <span className="text-sm font-semibold text-ink">Sleep een .html, .zip of .json hierheen</span>
                <span className="text-xs text-muted">ZIP moet een index.html bevatten · max 300 bestanden</span>
              </>
            )}
            <input type="file" className="sr-only" accept=".html,.htm,.zip,.json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        ) : (
          <input className="input" placeholder="https://mijn-app.example.com" value={url} onChange={(e) => setUrl(e.target.value)} />
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Titel</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Automatisch bepaald" /></div>
          <div>
            <label className="label">Vak koppelen</label>
            <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">— kies —</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div><label className="label">Beschrijving</label><textarea className="input min-h-16" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <p className="text-xs text-muted">Veiligheidsmanifest: imports worden niet in de hoofdapp uitgevoerd. Schadelijke patronen (vb. toegang tot StudyBase-data) worden geblokkeerd, externe netwerktoegang beperkt en alle berichten via het integratieprotocol worden gevalideerd.</p>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn-primary" onClick={submit} disabled={busy || (tab === 'file' ? !file : !url.trim())}>Importeren</button>
        </div>
      </div>
    </Modal>
  );
}
