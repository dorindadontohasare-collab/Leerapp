'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, QUESTION_TYPE_LABELS, QUIZ_MODE_LABELS, type Question, type Graded } from '@/lib/fetcher';
import { Card, Loading, ErrorState, ProgressBar, useToast, Confirm, Spinner, EmptyState } from '@/components/ui';
import { AnswerEditor, type AnswerValue } from '@/components/quiz/answer-inputs';

interface AttemptData {
  attempt: { id: string; mode: string; status: string; score: number | null; percent: number | null; startedAt?: string; snapshot: { order: string[]; timeLimitMin?: number; feedbackMode?: string } };
  questions: (Question & { objective_ids: string[]; savedAnswer?: AnswerValue | null; priorGraded?: Graded | null })[];
}

interface Report {
  percent: number;
  score: number;
  maxScore: number;
  durationS: number;
  perChapter?: { chapter: string; percent: number }[];
  perObjective?: { id: string; title: string; percent: number }[];
  wrong?: { questionId: string; prompt: string; userAnswer: unknown; graded: Graded; correctText: string }[];
}

export default function QuizRunnerPage() {
  const { id: quizId } = useParams<{ id: string }>();
  const toast = useToast();
  const [phase, setPhase] = useState<'loading' | 'quiz' | 'result' | 'error'>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<AttemptData | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [feedback, setFeedback] = useState<Record<string, Graded>>({});
  const [saving, setSaving] = useState(false);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [lives, setLives] = useState(3);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const startedAt = useRef(Date.now());
  const attemptId = useRef<string | null>(null);

  const start = useCallback(async () => {
    setPhase('loading');
    try {
      const s = await api.post<{ attemptId: string }>(`/api/quizzes/${quizId}/attempt`, { mode: 'practice' });
      attemptId.current = s.attemptId;
      const d = await api.get<AttemptData>(`/api/attempts/${s.attemptId}`);
      setData(d);
      const savedAnswers: Record<string, AnswerValue> = {};
      const savedFeedback: Record<string, Graded> = {};
      for (const q of d.questions) {
        if (q.savedAnswer) savedAnswers[q.id] = q.savedAnswer;
        if (q.priorGraded) savedFeedback[q.id] = q.priorGraded;
      }
      setAnswers(savedAnswers);
      setFeedback(savedFeedback);
      const firstUnanswered = Math.max(0, d.questions.findIndex((q) => !q.savedAnswer));
      setIdx(firstUnanswered);
      if (d.attempt.snapshot?.timeLimitMin) {
        const elapsedS = Math.floor((Date.now() - new Date(d.attempt.startedAt ?? Date.now()).getTime()) / 1000);
        setSecondsLeft(Math.max(0, d.attempt.snapshot.timeLimitMin * 60 - elapsedS));
      }
      if (d.attempt.mode === 'survival') setLives(3);
      setPhase('quiz');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kon quiz niet starten.');
      setPhase('error');
    }
  }, [quizId]);

  useEffect(() => { void start(); }, [start]);

  const timeUp = useCallback(async () => {
    toast.push('Tijd is om! De quiz wordt afgerond met je huidige antwoorden.', 'info');
    await finish(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (secondsLeft == null || phase !== 'quiz') return;
    if (secondsLeft <= 0) { void timeUp(); return; }
    const timer = setTimeout(() => setSecondsLeft((s) => (s == null ? null : s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft, phase, timeUp]);

  const questions = data?.questions ?? [];
  const q = questions[idx];
  const animate = useRef<string | null>(null);
  const snapshot = data?.attempt.snapshot;

  const saveAnswer = async (auto = false) => {
    if (!attemptId.current || !q) return;
    const answer = answers[q.id];
    if (!answer || Object.keys(answer).length === 0) return;
    setSaving(true);
    try {
      const r = await api.post<{ graded?: Graded; error?: string; degraded?: boolean }>(`/api/attempts/${attemptId.current}/answer`, {
        questionId: q.id, answer, timeMs: Math.max(500, Date.now() - startedAt.current)
      });
      if (r.error) { toast.push(r.error, 'error'); return; }
      if (r.graded) {
        setFeedback((f) => ({ ...f, [q.id]: r.graded as Graded }));
        if (data?.attempt.mode === 'survival' && !r.graded.correct) {
          setLives((l) => l - 1);
          if (lives - 1 <= 0) { toast.push('Geen levens meer — overlevingsronde afgelopen.', 'info'); await finish(true); }
        }
      }
      animate.current = q.id;
    } catch (e) {
      if (!auto) toast.push(e instanceof Error ? e.message : 'Antwoord opslaan mislukt', 'error');
    } finally { setSaving(false); }
  };

  const finish = async (silent = false) => {
    if (!attemptId.current) return;
    try {
      const r = await api.post<{ report: Report }>(`/api/attempts/${attemptId.current}/finish`);
      setReport(r.report);
      setPhase('result');
      if (!silent) toast.push('Quiz afgerond 🎉', 'success');
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Afronden mislukt', 'error');
    }
  };

  if (phase === 'loading') return <Loading label="Quiz laden…" />;
  if (phase === 'error') return <ErrorState message={error} onRetry={() => void start()} />;

  /* ---------- Resultaten ---------- */
  if (phase === 'result' && report) {
    return <ResultReport report={report} quizTitle={`Quiz ${quizId}`} onRestart={() => { setReport(null); void start(); }} />;
  }

  if (!q) return <Loading />;

  const instant = snapshot?.feedbackMode !== 'none';
  const graded = feedback[q.id];

  return (
    <div className="mx-auto max-w-3xl space-y-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button className="btn-ghost no-print" onClick={() => setConfirmAbandon(true)}>← Stoppen en opslaan</button>
        <div className="flex items-center gap-3">
          {data?.attempt.mode === 'survival' && <span className="chip bg-pastelpink">{'❤️'.repeat(Math.max(0, lives))}{'🖤'.repeat(3 - Math.max(0, lives))}</span>}
          {secondsLeft != null && (
            <span className={`chip ${secondsLeft < 60 ? 'bg-pastelpink text-ink' : 'bg-softblue text-ink2'}`} role="timer">
              ⏱ {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>Vraag {idx + 1} van {questions.length}</span>
          <span>{QUIZ_MODE_LABELS[data?.attempt.mode ?? 'practice'] ?? data?.attempt.mode} · {QUESTION_TYPE_LABELS[q.type] ?? q.type} · {q.points} pt</span>
        </div>
        <ProgressBar value={idx + 1} max={questions.length} />
      </div>

      <Card key={q.id + idx} className="fade-in space-y-4">
        <h1 className="text-lg font-bold text-ink">{q.prompt}</h1>
        {q.context && <p className="whitespace-pre-wrap rounded-xl border border-hairline bg-surface2 p-3 text-sm text-ink2">{q.context}</p>}

        <AnswerEditor question={q} value={answers[q.id] ?? {}} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-ghost" onClick={() => void saveAnswer()} disabled={saving || !answers[q.id]}>
            {saving ? <Spinner size={15} /> : '💾 Antwoord opslaan'}
          </button>
          {q.hint && q.hint.length > 0 && (
            <details className="rounded-lg border border-hairline bg-pastelyellow/40 px-3 py-1.5 text-sm text-ink">
              <summary className="cursor-pointer select-none text-xs font-bold">💡 Hint</summary>
              <p className="mt-1 text-xs text-ink2">{q.hint}</p>
            </details>
          )}
          {idx > 0 && <button className="btn-ghost ml-auto" onClick={() => setIdx(idx - 1)}>← Vorige</button>}
          {idx < questions.length - 1
            ? <button className="btn-primary" onClick={() => { void saveAnswer(true); setIdx(idx + 1); }}>Volgende →</button>
            : <button className="btn-yellow" onClick={() => { void saveAnswer(true); void finish(); }}> afronden ✓</button>}
        </div>

        {instant && graded && (
          <div className={`slide-up rounded-xl border p-4 ${graded.correct ? 'border-success/50 bg-success/5' : graded.partial ? 'border-warning/40 bg-pastelyellow/30' : 'border-danger/40 bg-pastelpink/40'}`} role="status">
            <p className="mb-1 text-sm font-bold text-ink">
              {graded.correct ? '✅ Correct!' : graded.partial ? '🟡 Gedeeltelijk correct' : '❌ Incorrect'} · {graded.points}/{graded.maxPoints} punten
              <span className="ml-1 text-xs font-normal text-muted">({graded.gradedBy === 'ai' ? 'AI-correction' : graded.gradedBy === 'self' ? 'zelfbeoordeling' : 'exact'})</span>
            </p>
            {graded.explanation && <p className="mb-1 text-sm text-ink2"><b>Uitleg:</b> {graded.explanation}</p>}
            {graded.missing && <p className="mb-1 text-sm text-ink2"><b>Ontbreekt:</b> {graded.missing}</p>}
            {graded.followUp && <p className="text-sm text-ink2"><b>Vervolgoefening:</b> {graded.followUp}</p>}
          </div>
        )}
      </Card>

      <p className="text-center text-xs text-muted">Antwoorden worden per vraag op de server opgeslagen — je voortgang blijft bewaard als je stopt.</p>

      <Confirm open={confirmAbandon} message="Stoppen met deze quiz? Je antwoorden t/m nu blijven opgeslagen en je kunt later verdergaan." onCancel={() => setConfirmAbandon(false)} onConfirm={() => { setConfirmAbandon(false); window.location.href = '/quizzes'; }} />
    </div>
  );
}

function ResultReport({ report, quizTitle, onRestart }: { report: Report; quizTitle: string; onRestart: () => void }) {
  const wrongCount = report.wrong?.length ?? 0;
  const fmtTime = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;
  return (
    <div className="space-y-4 pt-2 fade-in">
      <Card className="text-center">
        <p className="stat-label">Resultaat · {quizTitle}</p>
        <p className="mt-2 text-5xl font-extrabold tracking-tight text-ink">{report.percent}%</p>
        <p className="mt-1 text-sm text-muted">{report.score} van {report.maxScore} punten · duur {fmtTime(report.durationS ?? 0)}</p>
        <div className="mx-auto mt-4 max-w-md"><ProgressBar value={report.percent} /></div>
        <div className="mt-4 flex justify-center gap-2 no-print">
          <Link href="/quizzes" className="btn-ghost">Bibliotheek</Link>
          <Link href="/stats" className="btn-ghost">Statistieken</Link>
          <button className="btn-primary" onClick={onRestart}>Opnieuw oefenen</button>
        </div>
      </Card>

      {report.perChapter && report.perChapter.length > 0 && (
        <Card>
          <h2 className="section-title mb-3">Score per hoofdstuk</h2>
          <div className="space-y-2">{report.perChapter.map((c, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-sm text-ink2">{c.chapter}</span>
              <div className="w-40"><ProgressBar value={c.percent} /></div>
              <span className="w-10 text-right text-sm font-bold text-ink2">{c.percent}%</span>
            </div>
          ))}</div>
        </Card>
      )}

      {report.perObjective && report.perObjective.length > 0 && (
        <Card>
          <h2 className="section-title mb-3">Score per leerdoel</h2>
          <div className="space-y-2">{report.perObjective.map((o, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-sm text-ink2">{o.title}</span>
              <span className="text-sm font-bold text-ink2">{o.percent}%</span>
            </div>
          ))}</div>
        </Card>
      )}

      <Card>
        <h2 className="section-title mb-3">
          {wrongCount > 0 ? `Fouten (${wrongCount})` : 'Sterke punten'} · {wrongCount > 0 ? 'kijk hieronder wat je verder oefent' : 'alles correct!'}
        </h2>
        {wrongCount === 0 ? (
          <p className="text-sm text-ink2">Er is geen enkele fout gemaakt — probeer nu een moeilijkere quiz of examenniveau.</p>
        ) : (
          <ul className="space-y-3">
            {report.wrong!.map((w, i) => (
              <li key={i} className="rounded-xl border border-hairline p-3">
                <p className="text-sm font-semibold text-ink">{w.prompt}</p>
                <p className="mt-1 text-xs text-muted">Jouw antwoord: {typeof w.userAnswer === 'object' ? JSON.stringify(w.userAnswer) : String(w.userAnswer)}</p>
                {w.correctText && <p className="text-xs text-success">Correct antwoord: {w.correctText}</p>}
                {w.graded.explanation && <p className="mt-1 text-sm text-ink2"><b>Uitleg:</b> {w.graded.explanation}</p>}
                {w.graded.missing && <p className="text-xs text-ink2"><b>Ontbreekt:</b> {w.graded.missing}</p>}
                {w.graded.followUp && <p className="text-xs text-ink2"><b>Vervolgoefening:</b> {w.graded.followUp}</p>}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex gap-2 no-print">
          <Link href="/mistakes" className="btn-soft">🐞 Foutbibliotheek bekijken</Link>
          <Link href="/coach" className="btn-ghost">Vraag de coach om uitleg</Link>
        </div>
      </Card>
    </div>
  );
}
