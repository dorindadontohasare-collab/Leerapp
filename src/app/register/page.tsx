'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/fetcher';
import { Spinner } from '@/components/ui';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Kies een wachtwoord van minstens 8 tekens.'); return; }
    if (password !== confirm) { setError('De wachtwoorden komen niet overeen.'); return; }
    setBusy(true);
    try {
      await api.post('/api/auth/register', { name, email, password });
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registratie mislukt.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accentblue text-lg font-extrabold text-ink">SB</div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Start met StudyBase</h1>
          <p className="mt-1 text-sm text-muted">Maak je account aan en bouw je persoonlijke leerproces op.</p>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6" aria-labelledby="reg-title">
          <h2 id="reg-title" className="sr-only">Registreren</h2>
          <div>
            <label className="label" htmlFor="name">Naam</label>
            <input id="name" required className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
          <div>
            <label className="label" htmlFor="email">E-mailadres</label>
            <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="password">Wachtwoord (min. 8 tekens)</label>
            <input id="password" type="password" required minLength={8} className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <div>
            <label className="label" htmlFor="confirm">Wachtwoord bevestigen</label>
            <input id="confirm" type="password" required className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </div>
          {error && <p role="alert" className="rounded-lg bg-pastelpink px-3 py-2 text-sm text-ink">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? <Spinner size={16} /> : 'Account aanmaken'}
          </button>
          <p className="text-center text-sm text-muted">
            Alleen een account? <Link href="/login" className="link font-semibold">Aanmelden</Link>
          </p>
        </form>
        <p className="mt-4 text-center text-xs text-muted">Je gegevens blijven van jou: exporteer of verwijder ze op elk moment via Instellingen.</p>
      </div>
    </div>
  );
}
