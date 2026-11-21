'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

const ThemeCtx = createContext<{ theme: Theme; setTheme: (t: Theme) => void; resolved: 'light' | 'dark' }>({
  theme: 'system',
  setTheme: () => {},
  resolved: 'light'
});

export function ThemeProvider({ children, initial }: { children: React.ReactNode; initial?: Theme }) {
  const [theme, setThemeState] = useState<Theme>(initial ?? 'system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  const apply = useCallback((t: Theme) => {
    const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    setResolved(dark ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    const stored = (localStorage.getItem('sb_theme') as Theme | null) ?? initial ?? 'system';
    setThemeState(stored);
    apply(stored);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const current = (localStorage.getItem('sb_theme') as Theme | null) ?? 'system';
      if (current === 'system') apply('system');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem('sb_theme', t);
    apply(t);
  };

  return <ThemeCtx.Provider value={{ theme, setTheme, resolved }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
