'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '@/components/session-provider';
import { useTheme } from '@/components/theme-provider';
import { api } from '@/lib/fetcher';
import { Card, Loading, ErrorState, useToast } from '@/components/ui';

type Settings = {
  theme?: string; language?: string; aiModel?: string; aiDetail?: string; aiAnswerLength?: string; aiBehavior?: string;
  notifications?: { daily: boolean; exam: boolean; flashcards: boolean; breaks: boolean };
  pomodoro?: { work: number; break: number; long: number };
};

type SettingsResponse = {
  email: string; name: string; xp: number; streak: number; dailyGoalMinutes: number;
  settings: Settings; ai: { configured: boolean; provider: string; baseUrl: string; throttle?: { perHour: number; used: number } };
};

export default function SettingsPage() {
  const toast = useToast();
  const { refresh } = useSession();
  const { theme, setTheme } = useTheme();
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [dailyGoal, setDailyGoal] = useState(45);
  const [settings, setSettings] = useState<Settings>({});
  const [loadingExport, setLoadingExport] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await api.get<SettingsResponse>('/api/settings');
      setData(r);
      setName(r.name);
      setDailyGoal(r.dailyGoalMinutes);
      setSettings(r.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kon instellingen niet laden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async (patch: Record<string, unknown>, message?: string) => {
    try {
      await api.patch('/api/settings', patch);
      if (message) toast.show(message, 'success');
      void refresh();
      void load();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kon instellingen niet opslaan.', 'error');
    }
  }, [toast, load, refresh]);

  const downloadBlob = (content: string, filename: string, type: string) => {
    const a = document.createElement('a');
    a.href = typeof content === 'string' && content.startsWith('blob:') ? content : URL.createObjectURL(new Blob([content], { type }));
    a.download = filename;
    a.click();
  };

  const exportData = useCallback(async (kind: string, format: 'json' | 'csv') => {
    setLoadingExport(`${kind}-${format}`);
    try {
      const r = await api.get<{ filename: string; data?: unknown; csv?: string }>(`/api/export?kind=${kind}&format=${format}`);
      if (r.csv) downloadBlob(r.csv, r.filename, 'text/csv;charset=utf-8');
      else downloadBlob(JSON.stringify(r.data, null, 2), r.filename, 'application/json');
      toast.show(`Export gedownload: ${r.filename}`, 'success');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kon export niet maken.', 'error');
    } finally {
      setLoadingExport(null);
    }
  }, [toast]);

  const backupDownload = useCallback(async () => {
    setLoadingExport('backup');
    try {
      const r = await api.get<{ version: number; exportedAt: string; user: unknown; data: unknown; attempts: unknown }>('/api/backup');
      downloadBlob(JSON.stringify({ backup: r }, null, 2), `studybase-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
      toast.show('Back-up gedownload. Bewaar dit bestand op een veilige plek.', 'success');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kon back-up niet maken.', 'error');
    } finally {
      setLoadingExport(null);
    }
  }, [toast]);

  const restoreUpload = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed?.backup?.data) {
        toast.show('Dit lijkt geen geldig StudyBase-back-upbestand (verwacht { backup: { data: … } }).', 'error');
        return;
      }
      await api.post('/api/backup', parsed);
      toast.show('Back-up hersteld: je gegevens zijn opnieuw ingeladen in je account.', 'success');
      void refresh();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Herstellen mislukt.', 'error');
    }
  }, [toast, refresh]);

  if (loading) return <Loading label="Instellingen laden…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!data) return null;

  const notif = settings.notifications ?? { daily: true, exam: true, flashcards: true, breaks: false };

  return (
    <div className="space-y-4 pt-2">
      <div>
        <h1 className="section-title">Instellingen</h1>
        <p className="muted text-sm">Profiel, thema, AI-gedrag, meldingen en gegevensbeheer — alles werkt direct door in de app.</p>
      </div>

      {/* Profiel */}
      <Card className="p-5">
        <h2 className="section-title mb-3 text-base">Profiel</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="st-name">Naam</label>
            <input id="st-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="st-email">E-mail (account)</label>
            <input id="st-email" className="input" value={data.email} disabled />
          </div>
          <div>
            <label className="label" htmlFor="st-goal">Dagelijkse studiedoel (minuten)</label>
            <input id="st-goal" type="number" className="input" min={5} max={600} value={dailyGoal} onChange={(e) => setDailyGoal(Number(e.target.value))} />
          </div>
          <div>
            <label className="label" htmlFor="st-theme">Thema</label>
            <select id="st-theme" className="input" value={theme} onChange={(e) => { const v = e.target.value as 'light' | 'dark' | 'system'; setTheme(v); void save({ theme: v }, `Thema opgeslagen: ${v}.`); }}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="st-lang">Taal</label>
            <select id="st-lang" className="input" value={settings.language ?? 'nl'} onChange={(e) => { setSettings((s) => ({ ...s, language: e.target.value })); void save({ language: e.target.value }); }}>
              <option value="nl">Nederlands</option>
              <option value="en">English</option>
              <option value="fr">Français</option>
            </select>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button className="btn btn-primary" onClick={() => void save({ name, dailyGoalMinutes: dailyGoal }, 'Profiel opgeslagen.')}>Profiel opslaan</button>
        </div>
      </Card>

      {/* AI */}
      <Card className="p-5">
        <h2 className="section-title mb-1 text-base">AI-instellingen</h2>
        <p className="muted mb-3 text-sm">
          Status: {data.ai.configured
            ? <>✅ verbonden met <strong>{data.ai.provider}</strong> (API-key staat alleen op de server). Verbruik vandaag: {data.ai.throttle?.used ?? 0}/{data.ai.throttle?.perHour ?? 25} aanroepen.</>
            : <>⚠️ niet geconfigureerd — voeg <code>MISTRAL_API_KEY</code> toe aan de server-Omgevingsvariabelen (zie README). Alle AI-functies tonen dan een correcte status in plaats van te doen alsof ze werken.</>}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="st-model">AI-model</label>
            <select id="st-model" className="input" value={settings.aiModel ?? 'auto'} onChange={(e) => { setSettings((s) => ({ ...s, aiModel: e.target.value })); void save({ aiModel: e.target.value }); }}>
              <option value="auto">Automatisch (per taak het beste model)</option>
              <option value="mistral-large-latest">Mistral Large — beste redenering</option>
              <option value="mistral-small-latest">Mistral Small — sneller & goedkoper</option>
              <option value="open-mistral-nemo">Open Mistral Nemо — budget</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="st-detail">Uitlegdetail</label>
            <select id="st-detail" className="input" value={settings.aiDetail ?? 'gebalanceerd'} onChange={(e) => { setSettings((s) => ({ ...s, aiDetail: e.target.value })); void save({ aiDetail: e.target.value }); }}>
              <option value="kort">Kort — kern in één alinea</option>
              <option value="gebalanceerd">Gebalanceerd</option>
              <option value="diepgaand">Diepgaand — met voorbeelden en bronnen</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="st-len">Antwoordlengte</label>
            <select id="st-len" className="input" value={settings.aiAnswerLength ?? 'normaal'} onChange={(e) => { setSettings((s) => ({ ...s, aiAnswerLength: e.target.value })); void save({ aiAnswerLength: e.target.value }); }}>
              <option value="kort">Kort</option>
              <option value="normaal">Normaal</option>
              <option value="uitgebreid">Uitgebreid</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="st-behavior">AI-gedrag</label>
            <select id="st-behavior" className="input" value={settings.aiBehavior ?? 'encouraging'} onChange={(e) => { setSettings((s) => ({ ...s, aiBehavior: e.target.value })); void save({ aiBehavior: e.target.value }); }}>
              <option value="encouraging">Aanmoedigend</option>
              <option value="strict">Streng — examinator</option>
              <option value="neutral">Neutraal</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Meldingen */}
      <Card className="p-5">
        <h2 className="section-title mb-3 text-base">Meldingen</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            ['daily', 'Dagelijkse studiereminder'],
            ['exam', 'Examen- en deadlineherinneringen'],
            ['flashcards', 'Flashcardherhaling (spaced repetition)'],
            ['breaks', 'Pauzeherinneringen tijdens focus']
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[rgb(var(--c-accentblue))]"
                checked={Boolean(notif[key])}
                onChange={(e) => { const nextN = { ...notif, [key]: e.target.checked }; setSettings((s) => ({ ...s, notifications: nextN })); void save({ notifications: nextN }); }}
              />
              {label}
            </label>
          ))}
        </div>
      </Card>

      {/* Gegevens */}
      <Card className="p-5">
        <h2 className="section-title mb-3 text-base">Export, back-up & privacy</h2>
        <p className="muted mb-3 text-sm">Alle exports bevatten alleen jouw gegevens. Back-ups kun je terugzetten in dit account.</p>
        <div className="flex flex-wrap gap-2">
          {([
            ['full', 'Alles (JSON)', 'json'],
            ['progress', 'Voortgang (JSON)', 'json'],
            ['flashcards', 'Flashcards (JSON)', 'json'],
            ['summaries', 'Samenvattingen (JSON)', 'json'],
            ['quiz', 'Quizzen (JSON)', 'json'],
            ['plan', 'Planning (CSV)', 'csv'],
            ['plan', 'Planning (JSON)', 'json']
          ] as [string, string, 'json' | 'csv'][]).map(([kind, label, format], i) => {
            return (
              <button key={`${kind}-${i}`} className="btn btn-soft text-sm" disabled={loadingExport === `${kind}-${format}`} onClick={() => void exportData(kind, format)}>
                {loadingExport === `${kind}-${format}` ? '…' : `⬇ ${label}`}
              </button>
            );
          })}
        </div>

        <div className="mt-4 border-t border-[rgb(var(--c-hairline))] pt-4">
          <h3 className="label mb-2">Back-up</h3>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary text-sm" disabled={loadingExport === 'backup'} onClick={() => void backupDownload()}>{loadingExport === 'backup' ? '…' : '⬇ Back-up downloaden'}</button>
            <button className="btn btn-soft text-sm" onClick={() => fileRef.current?.click()}>⬆ Back-up herstellen…</button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void restoreUpload(f); e.target.value = ''; }}
            />
          </div>
          <p className="muted mt-2 text-xs">Herstellen voegt de back-upgegevens toe bij je account (dubbele items worden samengevoegd waar mogelijk). Zorg dat je eerst een actuele back-up downloadt.</p>
        </div>

        <div className="mt-4 border-t border-[rgb(var(--c-hairline))] pt-4">
          <h3 className="label mb-2">Privacy</h3>
          <ul className="muted list-disc space-y-1 pl-4 text-sm">
            <li>API-sleutels staan uitsluitend op de server; de frontend bevat geen sleutels.</li>
            <li>Geïmporteerde apps draaien in een sandboxed iframe en hebben geen toegang tot je gegevens.</li>
            <li>Delete-eindpunten verwijderen gegevens echt uit de database (geen prullenbak).</li>
            <li>Afbeeldingen voor OCR worden alleen lokaal verwerkt door de server, niet met derden gedeeld behalve via de geconfigureerde AI-provider.</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
