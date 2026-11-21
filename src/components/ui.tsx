'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Card({ children, className = '', ...rest }: React.ButtonHTMLAttributes<HTMLDivElement>) {
  return <div className={`card p-5 ${className}`} {...rest}>{children}</div>;
}

export function ProgressBar({ value, max = 100, color }: { value: number; max?: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / Math.max(1, max)) * 100)));
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-2 w-full overflow-hidden rounded-full bg-hairline">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color ?? 'rgb(var(--c-accentblue))' }} />
    </div>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1 rounded-xl border border-hairline bg-surface2 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${active === t.id ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-hairline px-6 py-12 text-center fade-in">
      {icon && <div className="flex h-12 w-12 items-center justify-center rounded-full bg-softblue text-2xl" aria-hidden="true">{icon}</div>}
      <h3 className="text-base font-bold text-ink">{title}</h3>
      <p className="max-w-md text-sm text-muted">{body}</p>
      {action}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm sm:items-center fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`card slide-up my-8 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} p-6`}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Sluiten" className="rounded-lg p-1.5 text-muted hover:bg-surface2 hover:text-ink">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Confirm({ open, message, onCancel, onConfirm }: { open: boolean; message: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal open={open} onClose={onCancel} title="Bevestigen">
      <p className="text-sm text-ink2">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onCancel}>Annuleren</button>
        <button className="btn-danger" onClick={onConfirm}>Ja, doorgaan</button>
      </div>
    </Modal>
  );
}

export function ChapterTag({ children }: { children: React.ReactNode }) {
  return <span className="chip bg-softblue text-ink2">{children}</span>;
}

/* ---------- Toasts ---------- */
type Toast = { id: number; kind: 'success' | 'error' | 'info' | 'warning'; text: string };
const ToastCtx = createContext<{ push: (text: string, kind?: Toast['kind']) => void }>({ push: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const tid = Date.now() + Math.random();
    setToasts((t) => [...t, { id: tid, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== tid)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 left-1/2 z-[60] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} role="status" className="slide-up flex items-center gap-2 rounded-xl border border-hairline bg-surface px-4 py-3 text-sm shadow-pop">
            <span aria-hidden="true">{t.kind === 'success' ? '✅' : t.kind === 'error' ? '⚠️' : 'ℹ️'}</span>
            <span className="text-ink2">{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const { push } = useContext(ToastCtx);
  return { push, show: push };
}

export function Loading({ label = 'Laden…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted fade-in">
      <Spinner size={22} />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-pastelpink text-2xl">⚠️</div>
      <p className="text-sm text-ink2">{message}</p>
      {onRetry && <button className="btn-ghost" onClick={onRetry}>Opnieuw proberen</button>}
    </div>
  );
}
