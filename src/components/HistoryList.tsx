'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRepository } from '@/data/RepositoryProvider';
import type { HandSummary } from '@/data/types';
import { formatMoney, formatStakes } from '@/lib/format';
import { PlayingCard } from './PlayingCard';

const PAGE = 50;
const pairs = (s: string) => s.match(/.{2}/g) ?? [];

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function HistoryList() {
  const { status, repo } = useRepository();
  const [hands, setHands] = useState<HandSummary[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (before?: string) => {
      if (!repo) return;
      try {
        const page = await repo.listHands({ limit: PAGE, before });
        setHands((h) => (before && h ? [...h, ...page] : page));
        setMore(page.length === PAGE);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [repo],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads data from the repository once it is ready
    if (status === 'ready') void load();
  }, [status, load]);

  if (error) return <p className="p-6 text-danger">{error}</p>;
  if (!hands) return <p className="p-6 text-muted">Loading history…</p>;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Hand history</h1>
      {hands.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          No hands yet. <Link href="/" className="text-accent hover:underline">Sit down at a table</Link> and they will appear here.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
          {hands.map((h) => (
            <li key={h.id}>
              <Link href={`/history/${h.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 hover:bg-surface-2">
                <div className="w-28 text-xs text-muted">
                  <div>{when(h.playedAt)}</div>
                  <div>
                    ${formatStakes(h.smallBlind, h.bigBlind)} · #{h.handNumber}
                    {h.learningMode && ' · learning'}
                  </div>
                </div>
                <span className="w-9 text-center text-xs font-semibold text-muted">{h.heroPosition}</span>
                <div className="flex gap-0.5">
                  {pairs(h.heroHoleCards).map((c) => (
                    <PlayingCard key={c} card={c} size="sm" />
                  ))}
                </div>
                <div className="flex min-w-36 gap-0.5">
                  {pairs(h.board).map((c) => (
                    <PlayingCard key={c} card={c} size="sm" />
                  ))}
                  {h.board === '' && <span className="text-xs text-muted">no flop</span>}
                </div>
                <span
                  className={`ml-auto font-mono text-sm font-semibold ${h.heroNet > 0 ? 'text-good' : h.heroNet < 0 ? 'text-danger' : 'text-muted'}`}
                >
                  {formatMoney(h.heroNet, { signed: true })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {more && (
        <button
          type="button"
          onClick={() => void load(hands.at(-1)!.playedAt)}
          className="mt-3 rounded-lg border border-line px-4 py-2 text-sm hover:bg-surface-2"
        >
          Load more
        </button>
      )}
    </div>
  );
}
