'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from './session-provider';
import { useTheme } from './theme-provider';
import { api } from '@/lib/fetcher';
import { Spinner } from './ui';

const NAV = [
  { href: '/', label: 'Dashboard', icon: '🏠' },
  { href: '/learn', label: 'Mijn leeromgeving', icon: '📚' },
  { href: '/documents', label: 'Documenten', icon: '📄' },
  { href: '/quizzes', label: 'Quizbibliotheek', icon: '🧩' },
  { href: '/apps', label: 'Mijn apps', icon: '🧱' },
  { href: '/coach', label: 'AI-studiecoach', icon: '🤖' },
  { href: '/flashcards', label: 'Flashcards', icon: '🃏' },
  { href: '/planner', label: 'Studieplanner', icon: '🗺️' },
  { href: '/calendar', label: 'Kalender', icon: '📅' },
  { href: '/mistakes', label: 'Foutbibliotheek', icon: '🐞' },
  { href: '/stats', label: 'Statistieken', icon: '📊' },
  { href: '/exam', label: 'Examenvoorbereiding', icon: '🎓' },
  { href: '/tools', label: 'Studietools', icon: '🧰' },
  { href: '/settings', label: 'Instellingen', icon: '⚙️' }
];

const initialCollapsed =
  typeof window !== 'undefined' ? localStorage.getItem('sb_sidebar') === 'collapsed' : false;

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('sb_sidebar', collapsed ? 'collapsed' : 'expanded');
  }, [collapsed]);
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const nav = (
    <nav aria-label="Hoofdnavigatie" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
      {NAV.map((n) => {
        const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? 'page' : undefined}
            title={n.label}
            className={`flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-semibold transition-colors ${active ? 'bg-softblue text-ink' : 'text-ink2 hover:bg-surface2'} ${collapsed ? 'justify-center px-0' : ''}`}
          >
            <span aria-hidden="true" className="text-base">{n.icon}</span>
            {!collapsed && <span className="truncate">{n.label}</span>}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Desktop */}
      <aside className={`no-print sticky top-0 hidden h-screen flex-col border-r border-hairline bg-surface transition-all duration-200 md:flex ${collapsed ? 'w-16' : 'w-64'}`}>
        <div className={`flex items-center gap-2 px-4 py-4 ${collapsed ? 'justify-center px-0' : ''}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accentblue text-sm font-extrabold text-ink">SB</div>
          {!collapsed && <span className="text-base font-extrabold tracking-tight text-ink">StudyBase</span>}
        </div>
        {nav}
        <div className="border-t border-hairline p-2">
          <button onClick={() => setCollapsed(!collapsed)} className="btn-ghost w-full" aria-label={collapsed ? 'Sidebar uitklappen' : 'Sidebar inklappen'}>
            {collapsed ? '»' : '« Sidebar inklappen'}
          </button>
        </div>
      </aside>

      {/* Mobiel */}
      <div className="no-print sticky top-0 z-40 flex items-center justify-between border-b border-hairline bg-surface px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accentblue text-xs font-extrabold">SB</div>
          <span className="font-extrabold">StudyBase</span>
        </div>
        <button className="btn-ghost px-3 py-1.5" onClick={() => setMobileOpen(!mobileOpen)} aria-expanded={mobileOpen} aria-label="Menu openen">
          ☰
        </button>
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) setMobileOpen(false); }}>
          <div className="flex h-full w-72 flex-col bg-surface shadow-pop">
            <div className="px-4 py-4 text-base font-extrabold">StudyBase</div>
            {nav}
          </div>
          <div className="flex-1 bg-ink/40" />
        </div>
      )}
    </>
  );
}

type SearchResult = { results: { type: string; id: string; title: string; subtitle: string | null }[] };

const SEARCH_META_ORDER = ['subject','chapter','objective','document','quiz','app','card','mistake','summary'] as const;
const SEARCH_META: Record<(typeof SEARCH_META_ORDER)[number], { label: string; icon: string; href: (id: string) => string }> = {
  subject: { label: 'Vakken', icon: '📚', href: (id) => `/learn?subject=${id}` },
  chapter: { label: 'Hoofdstukken', icon: '📖', href: (id) => `/learn?chapter=${id}` },
  objective: { label: 'Leerdoelen', icon: '🎯', href: (id) => `/learn?objective=${id}` },
  document: { label: 'Documenten', icon: '📄', href: (id) => `/documents?open=${id}` },
  quiz: { label: 'Quizzen', icon: '🧩', href: (id) => `/quizzes?open=${id}` },
  app: { label: 'Apps', icon: '🧱', href: (id) => `/apps?open=${id}` },
  card: { label: 'Flashcards', icon: '🃏', href: (id) => `/flashcards?open=${id}` },
  mistake: { label: 'Fouten', icon: '🐞', href: (id) => `/mistakes?open=${id}` },
  summary: { label: 'Samenvattingen', icon: '📝', href: (id) => `/documents?open=${id}` }
};

export function Topbar() {
  const { user, loading, logout } = useSession();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); setOpen(false); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api.get<SearchResult>(`/api/search?q=${encodeURIComponent(q)}`);
        setResults(JSON.stringify(r) === JSON.stringify({ results: [] }) ? { results: [] } : r);
        setOpen(true);
      } catch { setResults(null); }
      finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  const go = (href: string) => { setOpen(false); setQ(''); router.push(href); };

  return (
    <header className="no-print flex items-center gap-4 px-4 py-3 sm:px-6">
      <div className="relative w-full max-w-xl">
        <input
          className="input pl-9"
          placeholder="Zoek documenten, vakken, quizzen, apps, notities…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Globale zoekfunctie"
        />
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true">🔍</span>
        {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2"><Spinner size={14} /></span>}
        {open && results && (
          <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-96 overflow-y-auto rounded-card border border-hairline bg-surface p-2 shadow-pop fade-in">
            {results.results.length === 0 && <p className="px-3 py-4 text-sm text-muted">Geen resultaten gevonden.</p>}
            {SEARCH_META_ORDER.map((type) => {
              const meta = SEARCH_META[type];
              const items = results.results.filter((r) => r.type === type);
              if (!items.length) return null;
              return (
                <Group key={type} title={meta.label}>
                  {items.map((r) => <Item key={r.id} onClick={() => go(meta.href(r.id))} icon={meta.icon} label={r.title} hint={r.subtitle ?? undefined} />)}
                </Group>
              );
            })}
          </div>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <select
          aria-label="Thema kiezen"
          value={theme}
          onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}
          className="input w-auto py-1.5 text-xs"
        >
          <option value="light">☀️ Licht</option>
          <option value="dark">🌙 Donker</option>
          <option value="system">🖥️ Systeem</option>
        </select>
        {loading ? <Spinner size={16} /> : user && (
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-hairline bg-surface px-3 py-1 sm:flex">
              <span className="chip bg-pastelyellow text-ink">Lv {user.level}</span>
              <span className="text-xs font-semibold text-ink2">🔥 {user.streak}</span>
              <span className="text-xs text-muted">{user.xp} XP</span>
            </div>
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => void logout()}>Uitloggen</button>
          </div>
        )}
      </div>
    </header>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-muted">{title}</p>
      {children}
    </div>
  );
}
function Item({ onClick, icon, label, hint }: { onClick: () => void; icon: string; label: string; hint?: string }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink2 hover:bg-surface2">
      <span aria-hidden="true">{icon}</span>
      <span className="truncate">{label}</span>
      {hint && <span className="ml-auto text-xs text-muted">{hint}</span>}
    </button>
  );
}
