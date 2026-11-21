'use client';

import { useRouter } from 'next/navigation';
import { useRepository } from '@/data/RepositoryProvider';

/** Header badges: storage mode, hands waiting to sync, and a lock button. */
export function NavStatus() {
  const router = useRouter();
  const { status, repo, pendingSync, refresh, exitGuest } = useRepository();
  if (status !== 'ready' || !repo) return null;

  const lock = async () => {
    await fetch('/api/lock', { method: 'POST' }).catch(() => undefined);
    refresh();
  };

  return (
    <div className="ml-auto flex items-center gap-2 text-xs">
      {pendingSync > 0 && (
        <span className="rounded-full border border-accent/60 px-2 py-0.5 text-accent" title="Saved on this device; will upload when the server is reachable">
          {pendingSync} hand{pendingSync === 1 ? '' : 's'} waiting to sync
        </span>
      )}
      {repo.kind === 'guest' ? (
        <>
          <span className="rounded-full border border-good/60 px-2 py-0.5 text-good" title="Play money; hands are saved in this browser only">
            Guest
          </span>
          <button
            type="button"
            onClick={() => {
              exitGuest();
              router.push('/unlock');
            }}
            className="rounded-full border border-line px-2 py-0.5 text-muted hover:text-foreground"
          >
            Unlock
          </button>
        </>
      ) : repo.kind === 'local' ? (
        <span className="rounded-full border border-line px-2 py-0.5 text-muted" title="No database is connected; hands are saved in this browser only">
          Local storage only
        </span>
      ) : (
        <button type="button" onClick={lock} className="rounded-full border border-line px-2 py-0.5 text-muted hover:text-foreground">
          Lock
        </button>
      )}
    </div>
  );
}
