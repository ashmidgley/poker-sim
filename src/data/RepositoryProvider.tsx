'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { HttpRepository } from './httpRepository';
import { browserStore, PREFIX, PrefixedStore, type KeyValueStore } from './kv';
import { LocalRepository } from './localRepository';
import type { Repository } from './repository';
import { QUEUE_EVENT, RetryQueue } from './retryQueue';

type Status = 'loading' | 'ready' | 'locked';

interface RepositoryContextValue {
  status: Status;
  repo: Repository | null;
  store: KeyValueStore | null; // browser storage, for per-device state such as resume
  pendingSync: number; // hands waiting in the retry queue
  health: Health | null; // last /api/health answer (null if unreachable)
  /** Re-run the health check (after unlocking or locking). */
  refresh: () => void;
  /** Play without the passphrase: browser-only, play money, no access to the owner's data. */
  enterGuest: () => void;
  /** Leave guest mode (for example, to unlock). */
  exitGuest: () => void;
}

const GUEST_FLAG = `${PREFIX}guest-mode`;

function readGuestFlag(store: KeyValueStore): boolean {
  try {
    return store.getItem(GUEST_FLAG) === '1';
  } catch {
    return false;
  }
}

function writeGuestFlag(store: KeyValueStore, on: boolean): void {
  try {
    if (on) store.setItem(GUEST_FLAG, '1');
    else store.removeItem(GUEST_FLAG);
  } catch {
    // ignore: guest mode then lasts for this page only
  }
}

const RepositoryContext = createContext<RepositoryContextValue | null>(null);

export interface Health {
  db: boolean;
  authRequired: boolean;
  unlocked: boolean;
}

/**
 * On startup, asks /api/health which data source to use (PLAN 7.2):
 * no database -> LocalRepository; database -> HttpRepository, sending the
 * user to /unlock when the API needs the passphrase.
 */
export function RepositoryProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [repo, setRepo] = useState<Repository | null>(null);
  const [store, setStore] = useState<KeyValueStore | null>(null);
  const [queue, setQueue] = useState<RetryQueue | null>(null);
  const [pendingSync, setPendingSync] = useState(0);
  const [nonce, setNonce] = useState(0);
  const [health, setHealth] = useState<Health | null>(null);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const kv = browserStore();
      let health: Health = { db: false, authRequired: false, unlocked: true };
      let reached = false;
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (res.ok) {
          health = (await res.json()) as Health;
          reached = true;
        }
      } catch {
        // Offline at startup: run locally for now.
      }
      if (cancelled) return;
      setHealth(reached ? health : null);
      setStore(kv);
      if (!health.db) {
        setRepo(new LocalRepository(kv));
        setQueue(null);
        setStatus('ready');
        return;
      }
      if (health.authRequired && !health.unlocked) {
        if (readGuestFlag(kv)) {
          // Guests get their own browser-only, play-money space and never call the protected API.
          const guestStore = new PrefixedStore(kv, 'guest:');
          setStore(guestStore);
          setRepo(new LocalRepository(guestStore, undefined, undefined, { guest: true }));
          setQueue(null);
          setStatus('ready');
          return;
        }
        setRepo(null);
        setStatus('locked');
        return;
      }
      writeGuestFlag(kv, false); // unlocked: always the owner
      const q = new RetryQueue(kv);
      setQueue(q);
      setRepo(new HttpRepository(q));
      setStatus('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  // Keep the "waiting to sync" count current, and retry on load and when back online.
  useEffect(() => {
    if (!queue || !(repo instanceof HttpRepository)) return;
    const http = repo;
    const update = () => setPendingSync(queue.size());
    const flush = () => void http.flushQueue().finally(update);
    update();
    flush();
    window.addEventListener(QUEUE_EVENT, update);
    window.addEventListener('online', flush);
    return () => {
      window.removeEventListener(QUEUE_EVENT, update);
      window.removeEventListener('online', flush);
    };
  }, [queue, repo]);

  const enterGuest = useCallback(() => {
    writeGuestFlag(browserStore(), true);
    refresh();
  }, [refresh]);
  const exitGuest = useCallback(() => {
    writeGuestFlag(browserStore(), false);
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ status, repo, store, pendingSync: queue ? pendingSync : 0, health, refresh, enterGuest, exitGuest }),
    [status, repo, store, pendingSync, queue, health, refresh, enterGuest, exitGuest],
  );
  return (
    <RepositoryContext.Provider value={value}>
      {/* usePathname is request data under Cache Components, so it lives in its own Suspense boundary. */}
      <Suspense fallback={null}>
        <LockRedirect locked={status === 'locked'} />
      </Suspense>
      {children}
    </RepositoryContext.Provider>
  );
}

/** Sends users to the unlock screen while the API is locked. */
function LockRedirect({ locked }: { locked: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (locked && pathname !== '/unlock') router.replace('/unlock');
  }, [locked, pathname, router]);
  return null;
}

export function useRepository(): RepositoryContextValue {
  const ctx = useContext(RepositoryContext);
  if (!ctx) throw new Error('useRepository must be used inside RepositoryProvider');
  return ctx;
}
