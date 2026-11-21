'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Subject } from '@/lib/fetcher';
import { Card, Loading, ErrorState, Tabs, ProgressBar, useToast } from '@/components/ui';
import { FORMULA_LIBRARY } from '@/lib/formulas';

/* ---------- Rekenmachine ---------- */
function Calculator() {
  const [display, setDisplay] = useState('');
  const push = (s: string) => setDisplay((d) => d + s);
  const calc = () => {
    try {
      if (!/^[0-9+\-*/().,%\s]+$/.test(display)) throw new Error('ongeldig');
      const js = display.replace(/,/g, '.').replace('%', '/100');
      let ok = true;
      const result = new Function(`"use strict"; return (${js})`)() as unknown;
      if (typeof result !== 'number' || !isFinite(result)) ok = false;
      setDisplay(ok ? String(Math.round(Number(result) * 1e10) / 1e10) : 'Fout');
    } catch {
      setDisplay('Fout');
    }
  };
  return (
    <div className="mx-auto max-w-[280px] space-y-3">
      <input className="input text-right text-xl" value={display} onChange={(e) => setDisplay(e.target.value)} aria-label="Invoer rekenmachine" placeholder="0" />
      <div className="grid grid-cols-4 gap-2">
        {['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', '%', '+'].map((k) => (
          <button key={k} className="btn btn-soft py-2" onClick={() => push(k)}>{k}</button>
        ))}
        <button className="btn btn-ghost py-2" onClick={() => setDisplay('')}>C</button>
        <button className="btn btn-ghost py-2" onClick={() => setDisplay((d) => d.slice(0, -1))}>⌫</button>
        <button className="btn btn-primary col-span-2 py-2" onClick={calc}>=</button>
      </div>
    </div>
  );
}

/* ---------- Woordenboek (AI) ---------- */
type DictResult = { term: string; definition: string; simple: string; example: string };
function Dictionary({ aiConfigured }: { aiConfigured: boolean }) {
  const toast = useToast();
  const [term, setTerm] = useState('');
  const [simple, setSimple] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DictResult | null>(null);

  const lookup = useCallback(async () => {
    if (!term.trim()) return;
    setBusy(true); setResult(null);
    try {
      const r = await api.post<DictResult>('/api/tools/dictionary', { term, simple });
      setResult(r);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kon begrip niet opzoeken.', 'error');
    } finally {
      setBusy(false);
    }
  }, [term, simple, toast]);

  return (
    <div className="space-y-3">
      {!aiConfigured && <div className="chip" style={{ background: 'rgb(var(--c-pastelyellow) / 0.5)' }}>⚠️ AI niet geconfigureerd — het woordenboek werkt met een MISTRAL_API_KEY op de server.</div>}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void lookup(); }}>
        <input className="input flex-1" placeholder="Welk begrip wil je opzoeken?" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Zoekterm" />
        <button type="submit" className="btn btn-primary" disabled={busy || !term.trim()}>{busy ? 'Zoeken…' : 'Opzoeken'}</button>
      </form>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--c-accentblue))]" checked={simple} onChange={(e) => setSimple(e.target.checked)} />
        Leg het in eenvoudige taal uit
      </label>
      {result && (
        <div className="card bg-[rgb(var(--c-surface2))] p-4">
          <p className="mb-1 font-semibold">{result.term}</p>
          <p className="text-sm">{result.definition}</p>
          {result.simple && result.simple !== result.definition && (
            <p className="muted mt-2 text-sm">🧸 Eenvoudig: {result.simple}</p>
          )}
          {result.example && <p className="muted mt-2 text-sm">Voorbeeld: {result.example}</p>}
        </div>
      )}
    </div>
  );
}

/* ---------- Formulebibliotheek ---------- */
function Formulas() {
  const [filter, setFilter] = useState('');
  const cats = [...new Set(FORMULA_LIBRARY.map((f) => f.category))];
  const list = FORMULA_LIBRARY.filter((f) => !filter || f.category === filter);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="label" htmlFor="fx-cat">Vakgebied</label>
        <select id="fx-cat" className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Alles</option>
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="muted text-xs">Formules per vakgebied; geïmporteerde documenten met formules verschijnen ook bij elk document.</span>
      </div>
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead><tr><th>Formule</th><th>Formulevorm</th><th>Symbolen</th><th>Eenheden</th><th>Wanneer gebruiken</th><th>Voorbeeld</th></tr></thead>
          <tbody>
            {list.map((f) => (
              <tr key={f.name}>
                <td className="font-semibold">{f.name}</td>
                <td className="font-mono">{f.formula}</td>
                <td className="text-sm">{f.symbols}</td>
                <td className="text-sm">{f.units ?? '—'}</td>
                <td className="text-sm">{f.when}</td>
                <td className="text-sm">{f.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Pomodoro ---------- */
function Pomodoro() {
  const toast = useToast();
  const [workMin, setWorkMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);
  const [mode, setMode] = useState<'work' | 'break'>('work');
  const [left, setLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);

  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          if (mode === 'work') {
            setSessions((s) => s + 1);
            void api.post<{ xp: number }>('/api/tools/focus', { minutes: workMin })
              .then((r) => toast.show(`Focus-sessie voltooid! XP-totaal: ${r.xp}`, 'success'))
              .catch(() => toast.show('Sessie afgerond; XP kon niet worden opgeslagen.', 'warning'));
            setMode('break');
            return breakMin * 60;
          }
          setMode('work');
          return workMin * 60;
        }
        return l - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [running, mode, breakMin, workMin, toast]);

  const setPreset = (w: number, b: number) => { setWorkMin(w); setBreakMin(b); setMode('work'); setRunning(false); setLeft(w * 60); };

  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');

  return (
    <div className="mx-auto max-w-[320px] space-y-4 text-center">
      <div className={`mx-auto flex h-48 w-48 items-center justify-center rounded-full text-4xl font-bold ${mode === 'work' ? 'bg-softblue/60' : 'bg-pastelyellow/50'}`}>
        <div>
          {mm}:{ss}
          <div className="muted text-xs font-normal">{mode === 'work' ? 'Focus' : 'Pauze'} · {sessions} sessies vandaag</div>
        </div>
      </div>
      <div className="flex justify-center gap-2">
        <button className="btn btn-primary" onClick={() => setRunning((r) => !r)}>{running ? 'Pauzeer' : 'Start'}</button>
        <button className="btn btn-ghost" onClick={() => { setRunning(false); setLeft((mode === 'work' ? workMin : breakMin) * 60); }}>Reset</button>
      </div>
      <div className="flex justify-center gap-2 text-xs">
        {[{ w: 15, b: 3 }, { w: 25, b: 5 }, { w: 45, b: 10 }, { w: 60, b: 15 }].map((p) => (
          <button key={p.w} className="chip" onClick={() => setPreset(p.w, p.b)}>{p.w}/{p.b}</button>
        ))}
      </div>
    </div>
  );
}

/* ---------- Mondeling overhoren ---------- */
function OralPractice() {
  const toast = useToast();
  const [cards, setCards] = useState<{ id: string; front: string; back: string; hint: string | null }[]>([]);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [ttsOn, setTtsOn] = useState(true);
  const [score, setScore] = useState({ asked: 0, good: 0 });
  const [started, setStarted] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);

  const start = useCallback(async () => {
    try {
      const r = await api.get<{ due: { id: string; front: string; back: string; hint: string | null }[] }>('/api/flashcards/due');
      const pool = r.due.length ? r.due : (await api.get<{ cards: { id: string; front: string; back: string; hint: string | null }[] }>('/api/flashcards')).cards.slice(0, 20);
      if (!pool.length) { toast.show('Maak eerst flashcards om mondeling te overhoren.', 'warning'); return; }
      setCards(pool); setIdx(0); setScore({ asked: 0, good: 0 }); setStarted(true); setFeedback(null); setAnswer('');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kon kaarten niet laden.', 'error');
    }
  }, [toast]);

  const speak = useCallback((text: string) => {
    if (!ttsOn || typeof speechSynthesis === 'undefined') return;
    const ut = new SpeechSynthesisUtterance(text);
    ut.lang = 'nl-NL';
    speechSynthesis.speak(ut);
  }, [ttsOn]);

  const judge = useCallback(() => {
    const c = cards[idx];
    if (!c) return;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    const given = norm(answer);
    const key = norm(c.back);
    const hits = key.split(/\s+/).filter((w) => given.includes(w)).length;
    const good = given.length > 0 && hits >= Math.max(1, Math.ceil(key.split(/\s+/).length * 0.6));
    setScore((s) => ({ asked: s.asked + 1, good: s.good + (good ? 1 : 0) }));
    setFeedback(good ? '✅ Goed! Dat klopt vrijwel letterlijk.' : `❌ Niet helemaal. Juist: ${c.back}. Tip: ${c.hint ?? 'haal elk kernbegrip op in je antwoord'}`);
    if (good) void api.post('/api/flashcards/review', { cardId: c.id, grade: 4, objectiveId: null }).catch(() => { void 0; });
    else void api.post('/api/flashcards/review', { cardId: c.id, grade: 1, objectiveId: null }).catch(() => { void 0; });
    speak(good ? 'Goed gedaan.' : `Niet helemaal. Het juiste antwoord is: ${c.back}`);
  }, [cards, idx, answer, speak]);

  const next = () => {
    setFeedback(null); setAnswer('');
    if (idx + 1 >= cards.length) { setStarted(false); toast.show(`Klaar! ${score.good}/${score.asked} juist mondeling beantwoord.`, 'success'); }
    else setIdx((i) => i + 1);
  };

  const toggleMic = () => {
    const SR = typeof window !== 'undefined' ? ((window as unknown as Record<string, unknown>).SpeechRecognition ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition) : undefined;
    if (!SR) { toast.show('Spraakherkenning wordt niet ondersteund in deze browser — typ je antwoord gewoon in het veld.', 'warning'); return; }
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const rec = new (SR as new () => { start: () => void; stop: () => void; onresult: (e: { results: Array<Array<{ transcript: string }>> }) => void; lang: string; onend: () => void })();
    rec.lang = 'nl-NL';
    rec.onresult = (e) => setAnswer((a) => `${a} ${e.results[e.results.length - 1][0].transcript}`.trim());
    rec.onend = () => setListening(false);
    rec.start();
    setListening(true);
  };

  if (!started) {
    return (
      <div className="space-y-3">
        <p className="muted text-sm">De coach stelt vragen uit je flashcards. Als je microfoon werkt, praat je antwoord in; anders typ je het. Ingebouwde beoordeling vergelijkt je antwoord met de studiestof.</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--c-accentblue))]" checked={ttsOn} onChange={(e) => setTtsOn(e.target.checked)} />
          Lees vragen voor (spreken via tekst-naar-spraak)
        </label>
        <button className="btn btn-primary" onClick={() => void start()}>🎙 Overhoring starten</button>
      </div>
    );
  }

  const current = cards[idx];

  return (
    <div className="space-y-3">
      <ProgressBar value={idx} max={cards.length} />
      {current && (
        <div className="card bg-[rgb(var(--c-surface2))] p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--c-muted))]">Vraag {idx + 1}/{cards.length}</p>
          <p className="text-lg font-medium">{current.front}</p>
          {current.hint && <p className="muted text-sm">💡 {current.hint}</p>}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); judge(); }} className="space-y-2">
        <textarea className="input" rows={3} placeholder="Spreek of type je antwoord…" value={answer} onChange={(e) => setAnswer(e.target.value)} aria-label="Mondeling antwoord" />
        <div className="flex gap-2">
          <button type="button" className="btn btn-soft" onClick={toggleMic}>{listening ? '⏸ Stop opname' : '🎤 Luister'}</button>
          <button type="submit" className="btn btn-primary" disabled={!answer.trim()}>Beoordeel</button>
        </div>
      </form>
      {feedback && (
        <div className="card bg-[rgb(var(--c-surface2))] p-3 text-sm">
          {feedback}
          <div className="pt-2"><button className="btn btn-primary text-sm" onClick={next}>Volgende vraag</button></div>
        </div>
      )}
      <p className="muted text-xs">Score: {score.good}/{score.asked}</p>
    </div>
  );
}

/* ---------- Pagina ---------- */
export default function ToolsPage() {
  const toast = useToast();
  const [tab, setTab] = useState('calc');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [s, me] = await Promise.all([
          api.get<{ subjects: Subject[] }>('/api/subjects'),
          api.get<{ ai: { configured: boolean } }>('/api/auth/me')
        ]);
        setSubjects(s.subjects);
        setAiConfigured(Boolean(me?.ai?.configured));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Kon tools niet laden.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Loading label="Studietools laden…" />;
  if (error) return <ErrorState message={error} onRetry={() => setLoading(true)} />;

  return (
    <div className="space-y-4 pt-2">
      <div>
        <h1 className="section-title">Studietools</h1>
        <p className="muted text-sm">Handige extra's rond je studie: rekenen, begrippen, formules, focus en mondeling oefenen.</p>
      </div>
      <Tabs
        tabs={[
          { id: 'calc', label: 'Rekenmachine' },
          { id: 'dict', label: 'Woordenboek (AI)' },
          { id: 'formulas', label: 'Formulebibliotheek' },
          { id: 'focus', label: 'Focusmodus (Pomodoro)' },
          { id: 'oral', label: 'Mondeling overhoren' }
        ]}
        active={tab}
        onChange={setTab}
      />
      <Card className="p-5">
        {tab === 'calc' && <Calculator />}
        {tab === 'dict' && <Dictionary aiConfigured={aiConfigured} />}
        {tab === 'formulas' && <Formulas />}
        {tab === 'focus' && <Pomodoro />}
        {tab === 'oral' && <OralPractice />}
      </Card>
    </div>
  );
}
