'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, type User } from '@/lib/fetcher';
import { useTheme } from './theme-provider';

interface SessionCtx {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<SessionCtx>({ user: null, loading: true, refresh: async () => {}, logout: async () => {} });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { setTheme } = useTheme();

  const refresh = useCallback(async () => {
    try {
      const r = await api.get<{
        user: { id: string; email: string; name: string } | null;
        xp: number; level: { level: number; into: number; need: number };
        streak: number; dailyGoalMinutes: number; settings: Record<string, unknown>;
        badges: { code: string }[]; ai: { configured: boolean; provider: string };
      }>('/api/auth/me');
      setUser(r.user ? {
        id: r.user.id, email: r.user.email, name: r.user.name,
        xp: r.xp, level: r.level.level, levelInto: r.level.into, levelNeed: r.level.need,
        streak: r.streak, dailyGoalMinutes: r.dailyGoalMinutes,
        settings: r.settings, badges: r.badges.map((b) => b.code), aiStatus: r.ai
      } : null);
      const t = (r.settings?.theme as string) ?? 'system';
      if (t === 'light' || t === 'dark' || t === 'system') setTheme(t);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout');
    setUser(null);
    window.location.href = '/login';
  }, []);

  return <Ctx.Provider value={{ user, loading, refresh, logout }}>{children}</Ctx.Provider>;
}

export function useSession() {
  return useContext(Ctx);
}
