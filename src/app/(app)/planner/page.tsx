'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Subject } from '@/lib/fetcher';
import { Card, Loading, ErrorState, EmptyState, Modal, Confirm, Tabs, useToast } from '@/components/ui';

type Task = {
  id: string; title: string; minutes: number; due_date: string | null; priority: string; status: string;
  generated_by?: string; subject_id: string | null; subjectName?: string | null;
  objectiveTitle?: string | null; objectiveScore?: number | null; created_at: string;
};

const PRIORITY_LABELS: Record<string, string> = { low: 'Laag', normal: 'Normaal', high: 'Hoog' };

export default function PlannerPage() {
  const toast = useToast();
  const [tab, setTab] = useState('open');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmDel, setConfirmDel] = useState<Task | null>(null);

  const [modal, setModal] = useState(false);
  const [title, setTitle] = useState(''); const [minutes, setMinutes] = useState(30);
  const [dueDate, setDueDate] = useState(''); const [priority, setPriority] = useState('normal');
  const [subjectId, setSubjectId] = useState('');

  const [genOpen, setGenOpen] = useState(false);
  const [genDays, setGenDays] = useState(14); const [genMinutes, setGenMinutes] = useState(60);
  const [genSubjectId, setGenSubjectId] = useState(''); const [genBusy, setGenBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [t, s] = await Promise.all([
        api.get<{ tasks: Task[] }>('/api/tasks'),
        api.get<{ subjects: Subject[] }>('/api/subjects')
      ]);
      setTasks(t.tasks); setSubjects(s.subjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kon planning niet laden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleStatus = useCallback(async (t: Task) => {
    const nextStatus = t.status === 'done' ? 'open' : 'done';
    try {
      await api.patch(`/api/tasks/${t.id}`, { status: nextStatus });
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: nextStatus } : x)));
      toast.show(nextStatus === 'done' ? 'Taak afgevinkt. Goed bezig!' : 'Taak terug geopend.', 'success');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kon taak niet bijwerken.', 'error');
    }
  }, [toast]);

  const deleteTask = useCallback(async () => {
    if (!confirmDel) return;
    try {
      await api.del(`/api/tasks/${confirmDel.id}`);
      setTasks((prev) => prev.filter((x) => x.id !== confirmDel.id));
      toast.show('Taak verwijderd.', 'success');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kon taak niet verwijderen.', 'error');
    } finally {
      setConfirmDel(null);
    }
  }, [confirmDel, toast]);

  const saveTask = useCallback(async () => {
    if (!title.trim()) return;
    try {
      const r = await api.post<{ id: string }>('/api/tasks', {
        title, minutes, priority, subjectId: subjectId || null, dueDate: dueDate || null
      });
      await load();
      setModal(false); setTitle('');
      toast.show('Taak toegevoegd aan je planning.', 'success');
      void r;
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kon taak niet opslaan.', 'error');
    }
  }, [title, minutes, dueDate, priority, subjectId, toast, load]);

  const runGenerate = useCallback(async () => {
    setGenBusy(true);
    try {
      const r = await api.post<{ created: number }>('/api/planner/generate', {
        days: genDays, minutesPerDay: genMinutes, subjectId: genSubjectId || null
      });
      toast.show(`AI heeft ${r.created} studietaken ingepland (zwakke leerdoelen eerst).`, 'success');
      setGenOpen(false);
      void load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kon planning niet genereren.';
      toast.show(err instanceof Error && (err as Error & { configured?: boolean }).configured ? `${msg} (AI niet geconfigureerd)` : msg,
        err instanceof Error && (err as Error & { configured?: boolean }).configured ? 'warning' : 'error');
    } finally {
      setGenBusy(false);
    }
  }, [genDays, genMinutes, genSubjectId, toast, load]);

  const filtered = useMemo(() => (tab === 'open' ? tasks.filter((t) => t.status !== 'done') : tasks.filter((t) => t.status === 'done')), [tasks, tab]);
  const openCount = tasks.filter((t) => t.status !== 'done').length;
  const openMinutes = tasks.filter((t) => t.status !== 'done').reduce((sum, t) => sum + t.minutes, 0);

  if (loading) return <Loading label="Planning laden…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="section-title">Studieplanner</h1>
          <p className="muted text-sm">{openCount} open taken · {Math.round(openMinutes / 60 * 10) / 10} uur gepland</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost" onClick={() => setModal(true)}>+ Taak</button>
          <button className="btn btn-primary" onClick={() => setGenOpen(true)}>🤖 AI-planning maken</button>
        </div>
      </div>

      <Card>
        <Tabs tabs={[{ id: 'open', label: `Open (${openCount})` }, { id: 'done', label: 'Afgerond' }]} active={tab} onChange={setTab} />
        {filtered.length === 0 ? (
          <EmptyState
            icon="🗺️"
            title={tab === 'open' ? 'Geen open taken' : 'Nog niets afgerond'}
            body={tab === 'open' ? 'Laat de AI een persoonlijk traject maken op basis van je beheersingspercentages en examens, of maak zelf een taak.' : 'Vink taken af om hier je voortgang te zien.'}
            action={tab === 'open' ? <button className="btn btn-primary" onClick={() => setGenOpen(true)}>🤖 AI-planning maken</button> : undefined}
          />
        ) : (
          <ul className="divide-y divide-[rgb(var(--c-hairline))]">
            {filtered.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[rgb(var(--c-accentblue))]"
                  checked={t.status === 'done'}
                  onChange={() => void toggleStatus(t)}
                  aria-label={`Taak ${t.title} afvinken`}
                />
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-medium ${t.status === 'done' ? 'line-through opacity-60' : ''}`}>{t.title}</p>
                  <p className="muted text-xs">
                    {t.due_date ? `vóór ${t.due_date}` : 'geen deadline'} · {t.minutes} min
                    {t.subjectName ? ` · ${t.subjectName}` : ''}
                    {t.generated_by === 'ai' ? ' · 🤖 AI' : ''}
                    {t.priority === 'high' ? ' · 🔴 prioriteit' : ''}
                  </p>
                </div>
                <button className="btn btn-danger text-xs" onClick={() => setConfirmDel(t)}>✕</button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="Nieuwe studietaak">
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="pl-title">Taak</label>
            <input id="pl-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bijv. Hoofdstuk 4 samenvatten" />
          </div>
          <div>
            <label className="label" htmlFor="pl-subject">Vak</label>
            <select id="pl-subject" className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Geen vak</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="pl-min">Minuten</label>
              <input id="pl-min" type="number" className="input" min={5} max={600} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
            </div>
            <div>
              <label className="label" htmlFor="pl-date">Deadline</label>
              <input id="pl-date" type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="pl-prio">Prioriteit</label>
              <select id="pl-prio" className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setModal(false)}>Annuleer</button>
            <button className="btn btn-primary" onClick={() => void saveTask()} disabled={!title.trim()}>Opslaan</button>
          </div>
        </div>
      </Modal>

      <Modal open={genOpen} onClose={() => setGenOpen(false)} title="AI-planning genereren">
        <div className="space-y-3">
          <p className="muted text-sm">De planner verdeelt je tijd over open leerdoelen: zwakke eerst, rekening houdend met examendatums. Er worden nieuwe taken toegevoegd aan je planning.</p>
          <div>
            <label className="label" htmlFor="pl-gen-days">Aantal dagen: {genDays}</label>
            <input id="pl-gen-days" type="range" min={1} max={60} value={genDays} onChange={(e) => setGenDays(Number(e.target.value))} className="w-full" />
          </div>
          <div>
            <label className="label" htmlFor="pl-gen-min">Minuten per dag: {genMinutes}</label>
            <input id="pl-gen-min" type="range" min={15} max={600} step={15} value={genMinutes} onChange={(e) => setGenMinutes(Number(e.target.value))} className="w-full" />
          </div>
          <div>
            <label className="label" htmlFor="pl-gen-subject">Beperken tot vak (optioneel)</label>
            <select id="pl-gen-subject" className="input" value={genSubjectId} onChange={(e) => setGenSubjectId(e.target.value)}>
              <option value="">Alle vakken</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <p className="muted text-xs">✅ Deze planner werkt óók zonder AI-sleutel: hij gebruikt je beheersingspercentages en examendatums.</p>
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setGenOpen(false)}>Annuleer</button>
            <button className="btn btn-primary" onClick={() => void runGenerate()} disabled={genBusy}>{genBusy ? 'Plannen…' : 'Planning maken'}</button>
          </div>
        </div>
      </Modal>

      <Confirm open={!!confirmDel} message={`Taak "${confirmDel?.title ?? ''}" verwijderen?`} onCancel={() => setConfirmDel(null)} onConfirm={() => void deleteTask()} />
    </div>
  );
}
