'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/fetcher';
import { Card, Loading, ErrorState, useToast } from '@/components/ui';

type AppDetail = {
  app: {
    id: string; title: string; description: string | null; kind: string; integration: string;
    subject_id: string | null; entry_path: string | null; url: string | null; analysis: Record<string, unknown> | null;
  };
  results: { id: string; source: string; received_at: string; payload: Record<string, unknown> }[];
};

export default function AppRunnerPage() {
  const params = useParams<{ id: string }>();
  const appId = params.id;
  const toast = useToast();
  const [detail, setDetail] = useState<AppDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [integrated, setIntegrated] = useState(false);
  const [received, setReceived] = useState<Record<string, unknown>[]>([]);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const bufferRef = useRef<Record<string, unknown>[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<AppDetail>(`/api/apps/${appId}`);
      setDetail(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kon app niet laden.');
    } finally { setLoading(false); }
  }, [appId]);

  useEffect(() => { void load(); }, [load]);

  const flush = useCallback(async () => {
    const entries = bufferRef.current;
    if (!entries.length) return;
    bufferRef.current = [];
    try {
      const r = await api.post<{ accepted: number; rejected?: string[] }>(`/api/apps/${appId}/results`, { entries });
      if (r.rejected?.length) toast.push(`${r.rejected.length} bericht(en) afgewezen door protocolvalidatie (${r.rejected[0]})`, 'error');
      if (r.accepted) { setReceived((prev) => [...prev, ...entries.filter((e) => e.type === 'result')]); toast.push('Resultaat en opgeslagen in je leerproces ✅', 'success'); void load(); }
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Resultaten opslaan mislukt', 'error');
      bufferRef.current = [...entries, ...bufferRef.current];
    }
  }, [appId, toast, load]);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const d = ev.data;
      if (!d || typeof d !== 'object' || d.protocol !== 'studybase-integration/1.0') return;
      if (d.type === 'ready') {
        setIntegrated(true);
        frameRef.current?.contentWindow?.postMessage({ protocol: 'studybase-integration/1.0', type: 'handshake', appId }, '*');
      } else {
        bufferRef.current.push(d);
        if (flushTimer.current) clearTimeout(flushTimer.current);
        flushTimer.current = setTimeout(() => void flush(), 600);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [flush, appId]);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!detail) return null;

  const { app } = detail;
  const serveUrl = app.kind === 'url' ? (app.url ?? '') : `/api/apps/${app.id}/serve/`;
  const hasProtocolSupport = app.integration === 'protocol_supported' || integrated;

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-ink">{app.title}</h1>
          <p className="muted">{app.kind.toUpperCase()}{app.subject_id ? '' : ' · geen vak gekoppeld'}</p>
        </div>
        <div className="flex gap-2">
          <span className={`chip ${hasProtocolSupport ? 'bg-success/20' : 'bg-softblue'}`}>{hasProtocolSupport ? '🔗 Integratie actief' : '🚪 Alleen openen (geen protocol gerapporteerd)'}</span>
          <Link href="/apps" className="btn-ghost">← Terug</Link>
        </div>
      </div>

      {app.kind !== 'url' && (
        <Card className="text-xs text-muted">
          <b>Integratie-API:</b> deze app draait in een sandboxed iframe en communiceert via het protocol <code>studybase-integration/1.0</code>.
          Ontvangen resultaten verschijnen hieronder en tellen mee voor je beheersing (met objectiveIds) en statistieken (via summary).
        </Card>
      )}

      {app.kind === 'json' ? (
        <Card>
          <p className="mb-2 text-sm text-ink2">Dit is een JSON-export. De inhoud is als data geïmporteerd; scan deanalyse in de appkaart voor wat er herkend is.</p>
          <details><summary className="cursor-pointer text-sm font-semibold link">JSON-inhoud weergeven</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-surface2 p-3 text-xs">{JSON.stringify(app.analysis ?? {}, null, 2)}</pre>
          </details>
        </Card>
      ) : (
        <Card className="p-2">
          <iframe
            ref={frameRef}
            src={serveUrl}
            title={app.title}
            sandbox="allow-scripts allow-forms allow-popups"
            className="h-[70vh] w-full rounded-xl border-0 bg-white"
            referrerPolicy="no-referrer"
          />
        </Card>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">Ontvangen resultaten ({received.length + detail.results.length})</h2>
        </div>
        {(detail.results ?? []).length === 0 && received.length === 0 ? <p className="muted">Nog geen resultaten ontvangen. Oefen in de app — bij protocolondersteuning worden ze automatisch doorgegeven.</p> : (
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {[...(detail.results ?? []).reverse(), { id: 'live', payload: {}, source: '', received_at: '' }].slice(0, 40).map((r, i) => r.source === '' ? null : (
              <div key={r.id} className="rounded-lg border border-hairline px-3 py-2 text-xs">
                <p className="mb-1 text-muted">{r.source === 'manual' ? 'handmatig' : 'protocol'} · {new Date(r.received_at).toLocaleString('nl-NL')}</p>
                <p className="text-ink2">{safeSummary(r.payload)}</p>
              </div>
            ))}
          </div>
        )}
        <ManualResultEntry appId={app.id} onSaved={() => { void load(); toast.push('Handmatig resultaat opgeslagen ✅', 'success'); }} />
      </Card>
    </div>
  );
}

function safeSummary(payload: Record<string, unknown>): string {
  const bits: string[] = [];
  if (payload.questionId || payload.question) bits.push(String(payload.question ?? payload.questionId));
  if (typeof payload.isCorrect === 'boolean') bits.push(payload.isCorrect ? '✔ juist' : '✘ onjuist');
  if (typeof payload.score === 'number') bits.push(`score ${payload.score}${payload.maxScore ? '/' + String(payload.maxScore) : ''}`);
  if (Array.isArray(payload.objectiveIds) && payload.objectiveIds.length) bits.push(`leerdoelen: ${(payload.objectiveIds as string[]).length}`);
  return bits.join(' · ') || JSON.stringify(payload).slice(0, 120);
}

function ManualResultEntry({ appId, onSaved }: { appId: string; onSaved: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [isCorrect, setIsCorrect] = useState('true');
  const [objectiveIds, setObjectiveIds] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/api/apps/${appId}/results`, {
        entries: [{
          type: 'manual_result', source: 'manual', appId,
          questionId: 'manueel-' + Date.now(), question,
          isCorrect: isCorrect === 'true',
          objectiveIds: objectiveIds.split(',').map((s) => s.trim()).filter(Boolean),
          attemptId: 'manual-' + Date.now().toString(),
          completedAt: new Date().toISOString()
        }]
      });
      setOpen(false); setQuestion(''); setObjectiveIds('');
      onSaved();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Opslaan mislukt', 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-3 border-t border-hairline pt-3">
      <button className="btn-ghost" onClick={() => setOpen(!open)}>✍️ Resultaat handmatig invoeren (voor apps zonder integratie)</button>
      {open && (
        <div className="mt-2 space-y-2 rounded-xl border border-hairline p-3 fade-in">
          <input className="input" placeholder="Waar heb je over geoefend?" value={question} onChange={(e) => setQuestion(e.target.value)} aria-label="Omschrijving resultaat" />
          <div className="flex flex-wrap gap-2">
            <select className="input max-w-52" value={isCorrect} onChange={(e) => setIsCorrect(e.target.value)} aria-label="Uitkomst">
              <option value="true">Juist</option>
              <option value="false">Onjuist</option>
            </select>
            <input className="input max-w-64" placeholder="Leerdoel-ID's (optioneel, komma-gescheiden)" value={objectiveIds} onChange={(e) => setObjectiveIds(e.target.value)} />
          </div>
          <button className="btn-soft" onClick={submit} disabled={busy || !question.trim()}>Opslaan</button>
        </div>
      )}
    </div>
  );
}
