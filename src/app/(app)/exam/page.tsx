'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Subject } from '@/lib/fetcher';
import { Card, Loading, ErrorState, EmptyState, Modal, Confirm, ProgressBar, useToast } from '@/components/ui';

type Exam = {
  id: string; title: string; exam_date: string; exam_level: string | null; notes: string | null;
  subject_id: string | null; subjectName?: string | null; objectiveCount?: number; masteredCount?: number;
};

type Forecast = {
  forecast: { prognose: string; perSubject: { name: string; expected: string; note: string }[]; keyTopics: string[]; disclaimer: string };
  disclaimer: string;
};

function daysUntil(date: string): number {
  const d = new Date(`${date}T00:00:00`).getTime();
  return Math.ceil((d - Date.now()) / 86400000);
}

export default function ExamPage() {
  const toast = useToast();
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Exam | null>(null);
  const [title, setTitle] = useState(''); const [examDate, setExamDate] = useState('');
  const [examLevel, setExamLevel] = useState(''); const [notes, setNotes] = useState(''); const [subjectId, setSubjectId] = useState('');

  const [mockFor, setMockFor] = useState<Exam | null>(null);
  const [mockCount, setMockCount] = useState(20); const [mockMinutes, setMockMinutes] = useState(90); const [mockBusy, setMockBusy] = useState(false);

  const [forecastFor, setForecastFor] = useState<string | null>(null);
  const [forecast, setForecast] = useState<(Forecast & { exam: Exam }) | null>(null);
  const [forecastBusy, setForecastBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [e, s] = await Promise.all([
        api.get<{ exams: Exam[] }>('/api/exams'),
        api.get<{ subjects: Subject[] }>('/api/subjects')
      ]);
      setExams(e.exams); setSubjects(s.subjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kon examens niet laden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveExam = useCallback(async () => {
    if (!title.trim() || !examDate) return;
    try {
      const r = await api.post<{ id: string }>('/api/exams', { title, examDate, examLevel: examLevel || undefined, notes: notes || undefined, subjectId: subjectId || null });
      toast.show('Examen toegevoegd. De aftelklok loopt!', 'success');
      setModal(false); setTitle(''); setExamDate(''); setNotes('');
      void r;
      void load();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kon examen niet opslaan.', 'error');
    }
  }, [title, examDate, examLevel, notes, subjectId, toast, load]);

  const deleteExam = useCallback(async () => {
    if (!confirmDel) return;
    try {
      await api.del(`/api/exams/${confirmDel.id}`);
      setExams((prev) => prev.filter((x) => x.id !== confirmDel.id));
      toast.show('Examen verwijderd.', 'success');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kon examen niet verwijderen.', 'error');
    } finally {
      setConfirmDel(null);
    }
  }, [confirmDel, toast]);

  const runMock = useCallback(async () => {
    if (!mockFor) return;
    setMockBusy(true);
    try {
      const r = await api.post<{ quizId: string; count: number; timeLimitMin: number }>(`/api/exams/${mockFor.id}/mock`, { count: mockCount, timeLimitMin: mockMinutes });
      toast.show(`Proefexamen met ${r.count} vragen klaar. Succes!`, 'success');
      setMockFor(null);
      window.location.href = `/quizzes/${r.quizId}`;
    } catch (err) {
      const c = err instanceof Error && (err as Error & { configured?: boolean }).configured;
      toast.show(`${err instanceof Error ? err.message : 'Kon proefexamen niet genereren.'}${c ? ' Zonder AI-sleutel kun je via de quizbibliotheek handmatig een examenoefening maken.' : ''}`, c ? 'warning' : 'error');
    } finally {
      setMockBusy(false);
    }
  }, [mockFor, mockCount, mockMinutes, toast]);

  const runForecast = useCallback(async (exam: Exam) => {
    setForecastFor(exam.id); setForecastBusy(true);
    try {
      const r = await api.get<Forecast & { exam: Exam }>(`/api/exams/${exam.id}/forecast`);
      setForecast(r);
    } catch (err) {
      const c = err instanceof Error && (err as Error & { configured?: boolean }).configured;
      toast.show(`${err instanceof Error ? err.message : 'Kon prognose niet ophalen.'}${c ? ' De prognose werkt met een MISTRAL_API_KEY op de server.' : ''}`, c ? 'warning' : 'error');
    } finally {
      setForecastBusy(false);
    }
  }, [toast]);

  const sorted = [...exams].sort((a, b) => a.exam_date.localeCompare(b.exam_date));
  const upcoming = sorted.filter((e) => daysUntil(e.exam_date) >= 0);
  const donePast = sorted.filter((e) => daysUntil(e.exam_date) < 0);

  if (loading) return <Loading label="Examenvoorbereiding laden…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="section-title">Examenvoorbereiding</h1>
          <p className="muted text-sm">Aftelklok, AI-proefexamens met tijdslimiet en een voorzichtige voorspelling op basis van jouw beheersingspercentages.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal(true)}>+ Examen toevoegen</button>
      </div>

      {upcoming.length === 0 ? (
        <EmptyState icon="🎓" title="Geen examens gepland" body="Voeg je examen toe en StudyBase houdt de aftelklok bij, verdeelt je resterende tijd over de belangrijkste onderwerpen en maakt AI-proefexamens op examenniveau." action={<button className="btn btn-primary" onClick={() => setModal(true)}>+ Examen toevoegen</button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {upcoming.map((e) => {
            const d = daysUntil(e.exam_date);
            const total = Math.max(1, e.objectiveCount ?? 0);
            const mastered = e.masteredCount ?? 0;
            return (
              <Card key={e.id} className={`p-5 ${d <= 7 ? 'border-l-4 border-l-[rgb(var(--c-pastelyellow))]' : ''}`}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-bold">{e.title}</p>
                    <p className="muted text-sm">{e.subjectName ?? 'Algemeen'}{e.exam_level ? ` · ${e.exam_level}` : ''} · {new Date(`${e.exam_date}T00:00:00`).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                  </div>
                  <div className="text-right">
                    <div className={`stat-value ${d <= 3 ? 'text-[rgb(var(--c-danger))]' : d <= 7 ? 'text-[rgb(var(--c-warning))] text-2xl' : ''}`} style={{ fontSize: d <= 7 ? '1.6rem' : undefined }}>
                      {d === 0 ? 'VANDAAG' : d}
                    </div>
                    <div className="stat-label">dagen</div>
                  </div>
                </div>
                <div className="mb-3">
                  <ProgressBar value={mastered} max={total || 1} />
                  <p className="muted mt-1 text-xs">{mastered} / {total} leerdoelen beheerst voor dit vak</p>
                </div>
                {e.notes && <p className="muted mb-3 text-sm">{e.notes}</p>}
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-primary text-sm" onClick={() => { setMockFor(e); }}>📝 Proefexamen</button>
                  <button className="btn btn-soft text-sm" onClick={() => void runForecast(e)} disabled={forecastBusy && forecastFor === e.id}>
                    {forecastBusy && forecastFor === e.id ? 'Berekenen…' : '🔮 Examenprognose'}
                  </button>
                  <button className="btn btn-danger text-sm" onClick={() => setConfirmDel(e)}>✕</button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {donePast.length > 0 && (
        <Card>
          <h2 className="section-title mb-2 text-base">Afgelopen</h2>
          <ul className="divide-y divide-[rgb(var(--c-hairline))]">
            {donePast.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                <span>{e.title} · <span className="muted">{e.exam_date}</span></span>
                <button className="btn btn-danger text-xs" onClick={() => setConfirmDel(e)}>Verwijderen</button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="bg-[rgb(var(--c-surface2))]">
        <p className="muted text-sm">⚠️ <strong>Over prognoses:</strong> de examenprognose is een conservatieve schatting op basis van je beheersingspercentages en recente scores. Ze is <strong>nooit een garantie</strong> voor het echte examenresultaat.</p>
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="Examen toevoegen">
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="ex-title">Titel</label>
            <input id="ex-title" className="input" value={title} onChange={(ev) => setTitle(ev.target.value)} placeholder="Bijv. Centraal examen economie" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ex-date">Datum</label>
              <input id="ex-date" type="date" className="input" value={examDate} onChange={(ev) => setExamDate(ev.target.value)} min={new Date().toISOString().slice(0, 10)} />
            </div>
            <div>
              <label className="label" htmlFor="ex-level">Niveau (optioneel)</label>
              <input id="ex-level" className="input" value={examLevel} onChange={(ev) => setExamLevel(ev.target.value)} placeholder="bijv. 4H/5VWO/proefexamen" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="ex-subject">Vak</label>
            <select id="ex-subject" className="input" value={subjectId} onChange={(ev) => setSubjectId(ev.target.value)}>
              <option value="">Geen vak</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ex-notes">Notities</label>
            <textarea id="ex-notes" className="input" rows={2} value={notes} onChange={(ev) => setNotes(ev.target.value)} placeholder="bijv. Pakket 2 t/m 4, zakrekenmachine toegestaan" />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setModal(false)}>Annuleer</button>
            <button className="btn btn-primary" onClick={() => void saveExam()} disabled={!title.trim() || !examDate}>Opslaan</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!mockFor} onClose={() => setMockFor(null)} title="AI-proefexamen">
        <div className="space-y-3">
          <p className="muted text-sm">Genereert een examenniveau-quiz voor <strong>{mockFor?.title}</strong>, gekoppeld aan een tijdslimiet zoals in examenmodus.</p>
          <div>
            <label className="label" htmlFor="mock-count">Aantal vragen: {mockCount}</label>
            <input id="mock-count" type="range" min={5} max={40} value={mockCount} onChange={(e) => setMockCount(Number(e.target.value))} className="w-full" />
          </div>
          <div>
            <label className="label" htmlFor="mock-time">Tijdslimiet (min): {mockMinutes}</label>
            <input id="mock-time" type="range" min={10} max={180} step={5} value={mockMinutes} onChange={(e) => setMockMinutes(Number(e.target.value))} className="w-full" />
          </div>
          <p className="muted text-xs">⚠️ Vereist MISTRAL_API_KEY op de server. Zonder key krijg je een melding en kun je handmatig een examenquiz samenstellen via de quizbibliotheek.</p>
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setMockFor(null)}>Annuleer</button>
            <button className="btn btn-primary" onClick={() => void runMock()} disabled={mockBusy}>{mockBusy ? 'Genereren…' : 'Proefexamen maken'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!forecast} onClose={() => { setForecast(null); setForecastFor(null); }} title="Examenprognose" wide>
        {forecast && (
          <div className="space-y-4">
            <p className="text-lg font-semibold">{forecast.exam.title}</p>
            <p className="muted text-sm">{forecast.forecast.prognose}</p>
            {forecast.forecast.perSubject.length > 0 && (
              <div>
                <h3 className="label">Per vak</h3>
                <ul className="mt-1 space-y-2 text-sm">
                  {forecast.forecast.perSubject.map((ps, i) => (
                    <li key={i} className="rounded-xl bg-[rgb(var(--c-surface2))] p-3">
                      <p className="font-semibold">{ps.name}: {ps.expected}</p>
                      <p className="muted">{ps.note}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {forecast.forecast.keyTopics.length > 0 && (
              <div>
                <h3 className="label">Prioriteiten</h3>
                <ul className="list-disc pl-5 text-sm">{forecast.forecast.keyTopics.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </div>
            )}
            <p className="chip text-xs" style={{ background: 'rgb(var(--c-pastelyellow) / 0.4)' }}>{forecast.forecast.disclaimer}</p>
            <div className="flex justify-end gap-2">
              <Link className="btn btn-soft" href="/planner">Planning opstellen</Link>
              <button className="btn btn-primary" onClick={() => { setForecast(null); setForecastFor(null); }}>Sluiten</button>
            </div>
          </div>
        )}
      </Modal>

      <Confirm open={!!confirmDel} message={`Examen "${confirmDel?.title ?? ''}" verwijderen?`} onCancel={() => setConfirmDel(null)} onConfirm={() => void deleteExam()} />
    </div>
  );
}
