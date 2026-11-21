'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TableScreen } from '@/components/TableScreen';
import { useRepository } from '@/data/RepositoryProvider';
import { liveStateFromHand, loadLiveState, type LiveState } from '@/game/liveState';
import { sessionToConfig, type SessionConfig } from '@/game/session';

type Loaded =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'ended' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; config: SessionConfig; initial: LiveState | null };

export function PlayClient({ sessionId }: { sessionId: string }) {
  const { status, repo, store } = useRepository();
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });

  useEffect(() => {
    if (status !== 'ready' || !repo || !store) return;
    let cancelled = false;
    (async () => {
      try {
        const session = await repo.getSession(sessionId);
        if (cancelled) return;
        if (!session) return setLoaded({ kind: 'missing' });
        if (session.endedAt) return setLoaded({ kind: 'ended' });
        // Prefer this browser's saved table state; otherwise rebuild it from the last stored hand.
        let initial = loadLiveState(store, sessionId);
        if (!initial && session.handsPlayed > 0) {
          const [last] = await repo.listHands({ sessionId, limit: 1 });
          const full = last ? await repo.getHand(last.id) : null;
          initial = full ? liveStateFromHand(full.events) : null;
        }
        if (!cancelled) setLoaded({ kind: 'ready', config: sessionToConfig(session), initial });
      } catch (e) {
        if (!cancelled) setLoaded({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, repo, store, sessionId]);

  if (loaded.kind === 'ready') {
    return repo && store ? (
      <TableScreen config={loaded.config} repo={repo} store={store} initial={loaded.initial} />
    ) : (
      <p className="p-6 text-muted">Loading table…</p>
    );
  }
  if (loaded.kind === 'loading') return <p className="p-6 text-muted">Loading table…</p>;

  const message = {
    missing: ['Session not found', 'It may have been started in another browser without a database connected.'],
    ended: ['This session has ended', 'Its hands are in your history.'],
    error: ['Could not load the session', loaded.kind === 'error' ? loaded.message : ''],
  }[loaded.kind];
  return (
    <div className="mx-auto max-w-md p-6 text-center">
      <p className="font-semibold">{message[0]}</p>
      <p className="mt-1 text-sm text-muted">{message[1]}</p>
      <div className="mt-4 flex justify-center gap-2">
        <Link href="/" className="rounded-lg bg-accent px-4 py-2 font-semibold text-black">
          Back to the lobby
        </Link>
        {loaded.kind === 'ended' && (
          <Link href="/history" className="rounded-lg border border-line px-4 py-2">
            History
          </Link>
        )}
      </div>
    </div>
  );
}
