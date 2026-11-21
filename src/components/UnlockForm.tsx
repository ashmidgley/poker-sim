'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useRepository } from '@/data/RepositoryProvider';

/** Exchanges the passphrase for an httpOnly cookie via /api/unlock. The passphrase is never stored in the browser. */
export function UnlockForm() {
  const router = useRouter();
  const { health, status, repo, refresh, enterGuest } = useRepository();
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Go to the lobby once unlocked (or no passphrase is needed), or once guest
  // mode is active. Navigating any earlier would bounce back here while locked.
  const inGuestMode = status === 'ready' && repo?.kind === 'guest';
  useEffect(() => {
    if (health?.unlocked || inGuestMode) router.replace('/');
  }, [health, inGuestMode, router]);

  const unlock = async () => {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch('/api/unlock', { method: 'POST', headers: { 'x-passphrase': passphrase } });
      if (res.ok) {
        setPassphrase('');
        refresh();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error === 'passphrase_not_configured' ? 'The server has no passphrase configured.' : 'That passphrase is not right.');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Unlock</h1>
      <p className="mt-1 text-sm text-muted">Enter the passphrase to use your saved hands and bankroll.</p>
      <form
        className="mt-6 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void unlock();
        }}
      >
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          aria-label="Passphrase"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          className="rounded-md border border-line bg-surface px-3 py-2 outline-none focus:border-accent"
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={checking || passphrase.length === 0}
          className="rounded-lg bg-accent py-2.5 font-semibold text-black hover:brightness-110 disabled:opacity-60"
        >
          {checking ? 'Checking…' : 'Unlock'}
        </button>
      </form>
      <div className="mt-8 border-t border-line pt-6">
        <p className="text-sm text-muted">
          No passphrase? Play as a guest with play money. Your hands stay in this browser and there is no bankroll tracking.
        </p>
        <button
          type="button"
          onClick={enterGuest}
          className="mt-3 w-full rounded-lg border border-line py-2.5 font-semibold hover:bg-surface-2"
        >
          Play as guest
        </button>
      </div>
    </div>
  );
}
