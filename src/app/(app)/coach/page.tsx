'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Subject, type Chapter, type DocumentItem } from '@/lib/fetcher';
import { useSession } from '@/components/session-provider';
import { Card, Loading, ErrorState, EmptyState, useToast } from '@/components/ui';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = [
  'Leg dit hoofdstuk eenvoudiger uit.',
  'Waarom is mijn antwoord fout?',
  'Geef mij een moeilijkere oefening.',
  'Overhoor mij over dit onderwerp.',
  'Vergelijk deze twee begrippen.',
  'Wat moet ik nog studeren voor mijn examen?'
];

type CoachAi = { configured: boolean };

export default function CoachPage() {
  const { user, loading: userLoading } = useSession();
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, d] = await Promise.all([
        api.get<{ subjects: Subject[] }>('/api/subjects'),
        api.get<{ documents: DocumentItem[] }>('/api/documents')
      ]);
      setSubjects(s.subjects);
      setDocuments(d.documents);
      const me = await api.get<{ user: unknown; settings: Record<string, unknown>; ai: CoachAi } | null>('/api/auth/me');
      setAiConfigured(Boolean(me?.ai?.configured));
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kon context niet laden.', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!subjectId) { setChapters([]); setChapterId(''); return; }
    void api.get<{ chapters: Chapter[] }>(`/api/subjects/${subjectId}/chapters`).then((r) => setChapters(r.chapters)).catch(() => setChapters([]));
  }, [subjectId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    const history = messages.slice(-12).map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    setSending(true);
    try {
      const r = await api.post<{ reply: string }>('/api/coach', {
        kind: 'chat', message: text, history,
        subjectId: subjectId || null, chapterId: chapterId || null, documentId: documentId || null
      });
      setMessages((prev) => [...prev.slice(0, -1), { role: 'assistant', content: r.reply }]);
    } catch (err) {
      setMessages((prev) => prev.slice(0, -1));
      const msg = err instanceof Error ? err.message : 'De coach kon niet antwoorden.';
      toast.show(msg, err instanceof Error && (err as Error & { configured?: boolean }).configured ? 'warning' : 'error');
    } finally {
      setSending(false);
    }
  }, [input, messages, sending, subjectId, chapterId, documentId, toast]);

  if (userLoading || loading) return <Loading label="AI-studiecoach laden…" />;

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="section-title">AI-studiecoach</h1>
          <p className="muted text-sm">Je persoonlijke tutor, examinator en strategist — met kennis van je vakken, resultaten en fouten.</p>
        </div>
        {(aiConfigured === false) && (
          <div className="chip" style={{ background: 'rgb(var(--c-pastelyellow) / 0.5)' }}>
            ⚠️ AI niet geconfigureerd — voeg MISTRAL_API_KEY toe op de server (zie README)
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card className="flex h-[70vh] min-h-[420px] flex-col">
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <EmptyState
                icon="💬"
                title="Stel je eerste vraag"
                body="Vraag uitleg over een hoofdstuk, laat je antwoorden beoordelen of vraag wat je nog moet studeren. De coach kijkt mee met je voortgang."
              />
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === 'user'
                    ? 'rounded-br-sm bg-[rgb(var(--c-accentblue))] text-white'
                    : 'rounded-bl-sm bg-[rgb(var(--c-surface2))]'}`}
                >
                  {m.content || '…'}
                </div>
              </div>
            ))}
            {sending && <div className="muted text-xs">De coach denkt na…</div>}
          </div>
          <div className="border-t border-[rgb(var(--c-hairline))] p-3">
            <form
              className="flex gap-2"
              onSubmit={(e) => { e.preventDefault(); void send(); }}
            >
              <input
                className="input flex-1"
                placeholder="Stel je vraag…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                aria-label="Bericht aan de coach"
              />
              <button type="submit" className="btn btn-primary" disabled={!input.trim() || sending}>
                Verstuur
              </button>
            </form>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip hover:brightness-95" onClick={() => setInput(s)}>{s}</button>
              ))}
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="section-title mb-3 text-base">Context</h2>
            <p className="muted mb-3 text-xs">Kies waar de coach rekening mee moet houden. Antwoorden op basis van cursusmateriaal krijgen bronverwijzingen.</p>
            <label className="label" htmlFor="coach-subject">Vak</label>
            <select id="coach-subject" className="input mb-3" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Geen specifiek vak</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <label className="label" htmlFor="coach-chapter">Hoofdstuk</label>
            <select id="coach-chapter" className="input mb-3" value={chapterId} onChange={(e) => setChapterId(e.target.value)} disabled={!subjectId}>
              <option value="">{subjectId ? 'Geen specifiek hoofdstuk' : 'Kies eerst een vak'}</option>
              {chapters.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <label className="label" htmlFor="coach-doc">Document</label>
            <select id="coach-doc" className="input" value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
              <option value="">Geen document</option>
              {documents.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </Card>
          <Card>
            <h2 className="section-title mb-2 text-base">Hoe werkt de coach?</h2>
            <ul className="muted list-disc space-y-1 pl-4 text-xs">
              <li>De coach onthoudt je fouten, zwakke leerdoelen en recente resultaten.</li>
              <li>Bij onbegrip krijg je een andere uitleg, een nieuw voorbeeld of een oefening.</li>
              <li>Examenprognoses zijn voorzichtig en nooit een garantie.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
