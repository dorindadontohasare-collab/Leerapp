'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/fetcher';
import { Spinner } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api.post('/api/auth/login', { email, password });
      const next = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('next') : null;
      router.push(next || '/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aanmelden mislukt.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accentblue text-lg font-extrabold text-ink">SB</div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Welkom terug bij StudyBase</h1>
          <p className="mt-1 text-sm text-muted">Meld je aan om verder te gaan met je leerstof.</p>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6" aria-labelledby="login-title">
          <h2 id="login-title" className="sr-only">Aanmelden</h2>
          <div>
            <label className="label" htmlFor="email">E-mailadres</label>
            <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="password">Wachtwoord</label>
            <input id="password" type="password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          {error && <p role="alert" className="rounded-lg bg-pastelpink px-3 py-2 text-sm text-ink">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? <Spinner size={16} /> : 'Aanmelden'}
          </button>
          <p className="text-center text-sm text-muted">
            Nog geen account? <Link href="/register" className="link font-semibold">Registreren</Link>
          </p>
        </form>
        <p className="mt-4 text-center text-xs text-muted">
          Google- en Apple-login zijn configureerbare integraties (zie Instellingen en README) maar vereisen externe OAuth-codes.
        </p>
      </div>
    </div>
  );
}
