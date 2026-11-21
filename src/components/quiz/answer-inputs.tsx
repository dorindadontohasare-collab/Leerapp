'use client';

import React, { useState } from 'react';
import type { Question } from '@/lib/fetcher';

export type AnswerValue = Record<string, unknown>;

/** Interactieve component per vraagtype. `onChange` stuurt het antwoordobject zoals de grading-API het verwacht. */
export function AnswerEditor({ question, value, onChange }: { question: Question; value: AnswerValue; onChange: (v: AnswerValue) => void }) {
  switch (question.type) {
    case 'mc_single':
    case 'chart':
      return <ChoiceList question={question} selected={typeof value.choice === 'string' ? [value.choice] : []} onToggle={(id) => onChange({ choice: id })} multi={false} />;
    case 'mc_multi':
      return <ChoiceList question={question} selected={(value.choices as string[]) ?? []} onToggle={(id) => {
        const cur = ((value.choices as string[]) ?? []).slice();
        const idx = cur.indexOf(id);
        if (idx >= 0) cur.splice(idx, 1); else cur.push(id);
        onChange({ choices: cur });
      }} multi />;
    case 'true_false':
      return <ChoiceList question={{ ...question, options: [{ id: 'o1', text: 'Juist' }, { id: 'o2', text: 'Fout' }] }} selected={typeof value.choice === 'string' ? [value.choice] : []} onToggle={(id) => onChange({ choice: id })} multi={false} />;
    case 'numeric':
      return <NumericInput value={value} onChange={onChange} />;
    case 'fill':
      return <TextInput long={false} value={typeof value.text === 'string' ? value.text : ''} onChange={(t) => onChange({ text: t })} placeholder="Vul in…" />;
    case 'match':
      return <MatchEditor question={question} pairs={(value.pairs as { left: string; right: string }[]) ?? []} onChange={(pairs) => onChange({ pairs })} />;
    case 'sort':
      return <SortEditor question={question} order={(value.order as string[]) ?? []} onChange={(order) => onChange({ order })} />;
    case 'drag':
      return <DragEditor question={question} assignment={(value.assignment as Record<string, string>) ?? {}} onChange={(assignment) => onChange({ assignment })} />;
    case 'steps':
      return <StepsEditor value={value} onChange={onChange} />;
    default:
      return <TextInput long value={typeof value.text === 'string' ? value.text : ''} onChange={(t) => onChange({ text: t })} placeholder="Schrijf je antwoord… Gebruik eigen woorden, dat mag." />;
  }
}

function ChoiceList({ question, selected, onToggle, multi }: { question: Question; selected: string[]; onToggle: (id: string) => void; multi: boolean }) {
  return (
    <div role={multi ? 'group' : 'radiogroup'} className="space-y-2">
      {question.options.map((o) => {
        const active = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            role={multi ? 'checkbox' : 'radio'}
            aria-checked={active}
            onClick={() => onToggle(o.id)}
            className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${active ? 'border-accentblue bg-softblue/60 font-semibold text-ink' : 'border-hairline bg-surface text-ink2 hover:bg-surface2'}`}
          >
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${active ? 'border-accentblue bg-accentblue text-ink' : 'border-hairline'}`} aria-hidden="true">
              {multi ? (active ? '✓' : '') : String.fromCharCode(65 + question.options.indexOf(o))}
            </span>
            {o.text}
          </button>
        );
      })}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, long }: { value: string; onChange: (t: string) => void; placeholder: string; long?: boolean }) {
  return long
    ? <textarea className="input min-h-36" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    : <input className="input" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />;
}

function NumericInput({ value, onChange }: { value: AnswerValue; onChange: (v: AnswerValue) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        inputMode="decimal"
        step="any"
        className="input max-w-52"
        aria-label="Numeriek antwoord"
        value={typeof value.value === 'number' ? String(value.value) : ''}
        onChange={(e) => onChange({ value: e.target.value === '' ? undefined : Number(e.target.value), unit: typeof value.unit === 'string' ? value.unit : undefined })}
      />
      <input
        className="input max-w-40"
        placeholder="Eenheid (optioneel)"
        aria-label="Eenheid"
        value={typeof value.unit === 'string' ? value.unit : ''}
        onChange={(e) => onChange({ value: typeof value.value === 'number' ? value.value : undefined, unit: e.target.value })}
      />
    </div>
  );
}

function MatchEditor({ question, pairs, onChange }: { question: Question; pairs: { left: string; right: string }[]; onChange: (p: { left: string; right: string }[]) => void }) {
  const rights = [...new Set((question.options ?? []).map((o) => o.text))];
  return (
    <div className="space-y-2">
      {(question.options ?? []).map((o) => {
        const current = pairs.find((p) => p.left === o.text)?.right ?? '';
        return (
          <div key={o.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate rounded-lg bg-surface2 px-3 py-2 text-sm text-ink2">{o.text}</span>
            <span className="text-muted" aria-hidden="true">→</span>
            <select
              className="input max-w-56"
              aria-label={`Koppel ${o.text}`}
              value={current}
              onChange={(e) => {
                const next = pairs.filter((p) => p.left !== o.text);
                if (e.target.value) next.push({ left: o.text, right: e.target.value });
                onChange(next);
              }}
            >
              <option value="">— koppel —</option>
              {rights.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        );
      })}
    </div>
  );
}

function SortEditor({ question, order, onChange }: { question: Question; order: string[]; onChange: (ids: string[]) => void }) {
  const items = question.options ?? [];
  const ordered = order.length === items.length && items.every((i) => order.includes(i.id)) ? order : items.map((i) => i.id);
  const move = (idx: number, delta: number) => {
    const next = ordered.slice();
    const j = idx + delta;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">Zet de items in de juiste volgorde met de pijlen.</p>
      {ordered.map((oid, idx) => {
        const item = items.find((i) => i.id === oid);
        if (!item) return null;
        return (
          <div key={oid} className="flex items-center gap-2 rounded-xl border border-hairline bg-surface px-3 py-2">
            <span className="chip bg-softblue">{idx + 1}</span>
            <span className="min-w-0 flex-1 text-sm text-ink2">{item.text}</span>
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => move(idx, -1)} aria-label="Omhoog">▲</button>
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => move(idx, 1)} aria-label="Omlaag">▼</button>
          </div>
        );
      })}
    </div>
  );
}

function DragEditor({ question, assignment, onChange }: { question: Question; assignment: Record<string, string>; onChange: (a: Record<string, string>) => void }) {
  const items = question.options ?? [];
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">Bepaal bij elk item de juiste categorie.</p>
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate rounded-lg bg-surface2 px-3 py-2 text-sm text-ink2">{item.text}</span>
          <select
            className="input max-w-56"
            aria-label={`Categorie voor ${item.text}`}
            value={assignment[item.id] ?? ''}
            onChange={(e) => onChange({ ...assignment, [item.id]: e.target.value })}
          >
            <option value="">— categorie —</option>
            {items.map((c) => <option key={c.id} value={c.text}>{c.text}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}
function StepsEditor({ value, onChange }: { value: AnswerValue; onChange: (v: AnswerValue) => void }) {
  const [steps, setSteps] = useState<string[]>(Array.isArray(value.stepsText) ? (value.stepsText as string[]) : ['']);
  const set = (i: number, v: string) => {
    const next = steps.slice();
    next[i] = v;
    setSteps(next);
    onChange({ stepsText: next.filter((s) => s.trim() !== '') });
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">Los het probleem stap voor stap op.</p>
      {steps.map((s, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-2 chip bg-pastelyellow">Stap {i + 1}</span>
          <textarea className="input min-h-16" placeholder="Beschrijf deze stap…" value={s} onChange={(e) => set(i, e.target.value)} />
        </div>
      ))}
      <button type="button" className="btn-ghost" onClick={() => { setSteps([...steps, '']); }}>+ Stap toevoegen</button>
    </div>
  );
}
