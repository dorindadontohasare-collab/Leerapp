'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Subject } from '@/lib/fetcher';
import { Card, Loading, ErrorState, Modal, Confirm, useToast } from '@/components/ui';

type CalEvent = {
  id: string; title: string; kind: string; date: string; time: string | null; duration_min: number;
  subject_id: string | null; subjectName?: string | null; subjectColor?: string | null; description?: string | null; done?: number | null;
};

const KIND_LABELS: Record<string, string> = { exam: 'Examen', test: 'Toets', deadline: 'Deadline', study: 'Studieblok' };
const KIND_ICONS: Record<string, string> = { exam: '🎓', test: '📝', deadline: '⏰', study: '📚' };

function dateStr(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

const WEEKDAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

export default function CalendarPage() {
  const toast = useToast();
  const [view, setView] = useState<'day' | 'week' | 'month'>('week');
  const [cursor, setCursor] = useState(new Date());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [confirmDel, setConfirmDel] = useState<CalEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(dateStr(new Date()));

  const [title, setTitle] = useState(''); const [kind, setKind] = useState('study');
  const [time, setTime] = useState(''); const [durationMin, setDurationMin] = useState(60);
  const [subjectId, setSubjectId] = useState(''); const [eventDate, setEventDate] = useState(selectedDate);

  const range = useMemo(() => {
    const from = new Date(cursor); const to = new Date(cursor);
    if (view === 'day') { return [from, to]; }
    if (view === 'week') {
      const dow = (from.getDay() + 6) % 7;
      from.setDate(from.getDate() - dow);
      to.setDate(from.getDate() + 6);
      return [from, to];
    }
    const month = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    month.setDate(month.getDate() - ((month.getDay() + 6) % 7));
    last.setDate(last.getDate() + (6 - ((last.getDay() + 6) % 7)));
    return [month, last];
  }, [cursor, view]);

  const from = range[0]; const to = range[1];

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [e, s] = await Promise.all([
        api.get<{ events: CalEvent[] }>(`/api/calendar?from=${dateStr(from)}&to=${dateStr(to)}`),
        api.get<{ subjects: Subject[] }>('/api/subjects')
      ]);
      setEvents(e.events); setSubjects(s.subjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kon kalender niet laden.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const byDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of events) {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return map;
  }, [events]);

  const shift = (dir: number) => {
    const c = new Date(cursor);
    if (view === 'day') c.setDate(c.getDate() + dir);
    else if (view === 'week') c.setDate(c.getDate() + dir * 7);
    else c.setMonth(c.getMonth() + dir);
    setCursor(c);
  };

  const openCreate = useCallback((date: string) => {
    setEventDate(date); setTitle(''); setKind('study'); setTime(''); setDurationMin(60); setSubjectId('');
    setModal(true);
  }, []);

  const saveEvent = useCallback(async () => {
    if (!title.trim()) return;
    try {
      await api.post('/api/calendar', {
        title, kind, date: eventDate, time: time || null, durationMin, subjectId: subjectId || null
      });
      toast.show('Item toegevoegd aan de kalender.', 'success');
      setModal(false);
      void load();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kon item niet opslaan.', 'error');
    }
  }, [title, kind, eventDate, time, durationMin, subjectId, toast, load]);

  const toggleDone = useCallback(async (e: CalEvent) => {
    try {
      await api.patch(`/api/calendar/${e.id}`, { done: e.done ? 0 : 1 });
      setEvents((prev) => prev.map((x) => (x.id === e.id ? { ...x, done: e.done ? 0 : 1 } : x)));
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kon status niet wijzigen.', 'error');
    }
  }, [toast]);

  const deleteEvent = useCallback(async () => {
    if (!confirmDel) return;
    try {
      await api.del(`/api/calendar/${confirmDel.id}`);
      setEvents((prev) => prev.filter((x) => x.id !== confirmDel.id));
      toast.show('Item verwijderd.', 'success');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kon item niet verwijderen.', 'error');
    } finally {
      setConfirmDel(null);
    }
  }, [confirmDel, toast]);

  const moveEvent = useCallback(async (e: CalEvent, newDate: string) => {
    if (e.date === newDate) return;
    try {
      await api.patch(`/api/calendar/${e.id}`, { date: newDate });
      setEvents((prev) => prev.map((x) => (x.id === e.id ? { ...x, date: newDate } : x)));
      toast.show(`"${e.title}" verplaatst naar ${newDate}.`, 'success');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kon item niet verplaatsen.', 'error');
    }
  }, [toast]);

  const daysGrid = useMemo(() => {
    const arr: Date[] = [];
    const d = new Date(from);
    while (d <= to) { arr.push(new Date(d)); d.setDate(d.getDate() + 1); }
    return arr;
  }, [from, to]);


  const headerLabel = view === 'day'
    ? cursor.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
    : view === 'week'
      ? `${from.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} – ${to.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : cursor.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });

  if (loading) return <Loading label="Kalender laden…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  const EventPill = ({ e }: { e: CalEvent }) => (
    <button
      className="chip w-full truncate text-left text-xs"
      style={{ background: e.subjectColor ? `${e.subjectColor}22` : undefined, borderColor: e.subjectColor ?? undefined }}
      onClick={() => setConfirmDel(e)}
      title={`${KIND_LABELS[e.kind] ?? e.kind}: ${e.title}${e.time ? ` om ${e.time}` : ''} — klik voor beheer`}
    >
      {KIND_ICONS[e.kind] ?? '•'} {e.title}{e.done ? ' ✓' : ''}
    </button>
  );

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="section-title">Kalender</h1>
          <p className="muted text-sm">Examens, toetsen, deadlines en studieblokken op één plek. Klik op een item om te beheren of te verplaatsen.</p>
        </div>
        <button className="btn btn-primary" onClick={() => openCreate(selectedDate)}>+ Nieuw item</button>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button className="btn btn-ghost" onClick={() => shift(-1)} aria-label="Vorige">‹</button>
          <button className="btn btn-ghost" onClick={() => { setCursor(new Date()); setSelectedDate(dateStr(new Date())); }}>Vandaag</button>
          <button className="btn btn-ghost" onClick={() => shift(1)} aria-label="Volgende">›</button>
          <span className="ml-2 font-semibold">{headerLabel}</span>
          <div className="ml-auto flex gap-1">
            {(['day', 'week', 'month'] as const).map((v) => (
              <button key={v} className={`${view === v ? 'btn btn-primary' : 'btn btn-ghost'} text-xs`} onClick={() => setView(v)}>
                {v === 'day' ? 'Dag' : v === 'week' ? 'Week' : 'Maand'}
              </button>
            ))}
          </div>
        </div>

        {view === 'day' && (
          <div className="space-y-2">
            <button className="btn btn-soft w-full text-sm" onClick={() => openCreate(selectedDate)}>+ Studieblok of examen op {selectedDate}</button>
            {(byDate.get(selectedDate) ?? []).length === 0
              ? <p className="muted py-6 text-center text-sm">Niets gepland vandaag.</p>
              : (byDate.get(selectedDate) ?? []).map((e) => (
                <div key={e.id} className="card flex items-center gap-3 p-3">
                  <span className="text-lg">{KIND_ICONS[e.kind] ?? '•'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.title}</p>
                    <p className="muted text-xs">{KIND_LABELS[e.kind] ?? e.kind}{e.time ? ` · ${e.time}` : ''} · {e.duration_min} min{e.subjectName ? ` · ${e.subjectName}` : ''}</p>
                  </div>
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--c-accentblue))]" checked={!!e.done} onChange={() => void toggleDone(e)} /> af</label>
                </div>
              ))}
          </div>
        )}

        {view === 'week' && (
          <div className="grid gap-2 md:grid-cols-7">
            {daysGrid.slice(0, 7).map((d) => {
              const ds = dateStr(d);
              const list = byDate.get(ds) ?? [];
              return (
                <div
                  key={ds}
                  className={`min-h-[120px] rounded-xl border p-2 ${ds === dateStr(new Date()) ? 'border-[rgb(var(--c-accentblue))]' : 'border-[rgb(var(--c-hairline))]'}`}
                  onDragOver={(ev) => ev.preventDefault()}
                  onDrop={(ev) => {
                    ev.preventDefault();
                    const id = ev.dataTransfer.getData('text/event-id');
                    const src = events.find((x) => x.id === id);
                    if (src) void moveEvent(src, ds);
                  }}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-semibold">{WEEKDAYS[(d.getDay() + 6) % 7]} {d.getDate()}</span>
                    <button className="muted text-xs hover:opacity-70" onClick={() => openCreate(ds)} aria-label={`Nieuw item op ${ds}`}>+</button>
                  </div>
                  <div className="space-y-1">
                    {list.map((e) => (
                      <div key={e.id} draggable onDragStart={(ev) => ev.dataTransfer.setData('text/event-id', e.id)}>
                        <EventPill e={e} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {view === 'month' && (
          <div>
            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-[rgb(var(--c-muted))]">
              {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {daysGrid.map((d) => {
                const ds = dateStr(d);
                const inMonth = d.getMonth() === cursor.getMonth();
                const list = byDate.get(ds) ?? [];
                return (
                  <div
                    key={ds}
                    className={`min-h-[72px] rounded-lg border p-1 text-xs ${ds === dateStr(new Date()) ? 'border-[rgb(var(--c-accentblue))]' : 'border-[rgb(var(--c-hairline))]'} ${inMonth ? '' : 'opacity-40'}`}
                    onDragOver={(ev) => ev.preventDefault()}
                    onDrop={(ev) => {
                      ev.preventDefault();
                      const id = ev.dataTransfer.getData('text/event-id');
                      const src = events.find((x) => x.id === id);
                      if (src) void moveEvent(src, ds);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{d.getDate()}</span>
                      <button className="hover:opacity-70" onClick={() => openCreate(ds)} aria-label={`Nieuw item op ${ds}`}>+</button>
                    </div>
                    <div className="space-y-0.5">
                      {list.slice(0, 3).map((e) => (
                        <div key={e.id} draggable onDragStart={(ev) => ev.dataTransfer.setData('text/event-id', e.id)}>
                          <EventPill e={e} />
                        </div>
                      ))}
                      {list.length > 3 && <span className="muted">+{list.length - 3} meer</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="Nieuw agendapunt">
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="cal-title">Titel</label>
            <input id="cal-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bijv. Examen economie" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="cal-kind">Soort</label>
              <select id="cal-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
                {Object.entries(KIND_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="cal-date">Datum</label>
              <input id="cal-date" type="date" className="input" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="cal-time">Tijd (optioneel)</label>
              <input id="cal-time" type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="cal-dur">Duur (min)</label>
              <input id="cal-dur" type="number" className="input" min={5} max={1440} value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="cal-subject">Vak (optioneel)</label>
            <select id="cal-subject" className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Geen vak</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setModal(false)}>Annuleer</button>
            <button className="btn btn-primary" onClick={() => void saveEvent()} disabled={!title.trim()}>Opslaan</button>
          </div>
        </div>
      </Modal>

      <Confirm
        open={!!confirmDel}
        message={confirmDel ? `"${confirmDel.title}" (${KIND_LABELS[confirmDel.kind]}) verwijderen?` : ''}
        onCancel={() => setConfirmDel(null)}
        onConfirm={() => void deleteEvent()}
      />
    </div>
  );
}
