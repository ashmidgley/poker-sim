'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { KeyValueStore } from '@/data/kv';
import type { Repository } from '@/data/repository';
import type { Session } from '@/data/types';
import { clearLiveState, liveStateFromHand, loadLiveState } from '@/game/liveState';
import { formatMoney, formatStakes } from '@/lib/format';

const HERO_SEAT = 0;

/** The hero's stack in an open session: this browser's table state, else the last stored hand, else the buy-ins. */
async function currentStack(repo: Repository, store: KeyValueStore, s: Session): Promise<number> {
  const live = loadLiveState(store, s.id);
  if (live && HERO_SEAT in live.stacks) return live.stacks[HERO_SEAT];
  if (s.handsPlayed > 0) {
    const [last] = await repo.listHands({ sessionId: s.id, limit: 1 });
    const full = last ? await repo.getHand(last.id) : null;
    const fromHand = full ? liveStateFromHand(full.events) : null;
    if (fromHand && HERO_SEAT in fromHand.stacks) return fromHand.stacks[HERO_SEAT];
  }
  return s.totalBoughtIn;
}

export function OpenSessions({
  sessions,
  repo,
  store,
  onChange,
}: {
  sessions: Session[];
  repo: Repository;
  store: KeyValueStore;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cashOut = async (s: Session) => {
    setBusy(s.id);
    setError(null);
    try {
      const stack = await currentStack(repo, store, s);
      await repo.endSession(s.id, stack);
      clearLiveState(store, s.id);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mt-6 rounded-xl border border-accent/40 bg-surface p-4">
      <h2 className="text-sm font-semibold">Open sessions</h2>
      <ul className="mt-2 flex flex-col divide-y divide-line">
        {sessions.map((s) => {
          const live = loadLiveState(store, s.id);
          const stack = live?.stacks[HERO_SEAT];
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="font-medium">${formatStakes(s.smallBlind, s.bigBlind)}</span>
              <span className="text-muted">
                {s.opponents} opp · {s.handsPlayed} hand{s.handsPlayed === 1 ? '' : 's'} · bought in {formatMoney(s.totalBoughtIn)}
                {stack !== undefined && <> · stack {formatMoney(stack)}</>}
              </span>
              <span className="ml-auto flex gap-2">
                <Link href={`/play/${s.id}`} className="rounded-md bg-accent px-3 py-1 font-semibold text-black hover:brightness-110">
                  Resume
                </Link>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void cashOut(s)}
                  className="rounded-md border border-line px-3 py-1 hover:bg-surface-2 disabled:opacity-50"
                >
                  {busy === s.id ? 'Cashing out…' : 'Cash out'}
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}
