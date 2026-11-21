'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StoredHand } from '@/data/types';
import { buildReplay } from '@/game/replayer';
import type { TableState } from '@/game/tableReducer';
import { buildTableView } from '@/game/tableView';
import { formatMoney, formatStakes } from '@/lib/format';
import { ActionLog } from './ActionLog';
import { TableView } from './TableView';

/** Step through a stored hand, forwards and back (PLAN 4.9). */
export function HandReplayer({ hand }: { hand: StoredHand }) {
  const replay = useMemo(() => buildReplay(hand.events), [hand.events]);
  const last = replay.steps.length - 1;
  const [step, setStep] = useState(last);
  const [revealAll, setRevealAll] = useState(false);
  const current = replay.steps[step];

  const tableState: TableState = useMemo(() => {
    const { input } = replay;
    return {
      config: {
        id: hand.sessionId,
        seed: input.sessionSeed,
        createdAt: hand.playedAt,
        opponents: input.seats.length - 1,
        botProfiles: [],
        smallBlind: input.config.smallBlind,
        bigBlind: input.config.bigBlind,
        buyIn: 0,
        rake: input.config.rake,
        learningMode: hand.learningMode,
      },
      players: input.seats.map((s) => ({ ...s, name: s.isHuman ? 'You' : s.name, profile: null })),
      button: input.buttonSeat,
      handNumber: input.handNumber,
      hand: current.state,
      events: current.events,
      error: null,
    };
  }, [replay, current, hand.sessionId, hand.playedAt, hand.learningMode]);

  const view = useMemo(() => buildTableView(tableState, { revealAll }), [tableState, revealAll]);
  const name = useCallback(
    (seat: number) => tableState.players.find((p) => p.seat === seat)?.name ?? `Seat ${seat}`,
    [tableState.players],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1));
      if (e.key === 'ArrowRight') setStep((s) => Math.min(last, s + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last]);

  const btn = 'rounded-md border border-line bg-surface-2 px-3 py-1.5 text-sm enabled:hover:border-accent disabled:opacity-40';

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <Link href="/history" className="text-muted hover:text-foreground">
          ← History
        </Link>
        <span className="font-semibold">
          Hand #{hand.handNumber} · ${formatStakes(hand.smallBlind, hand.bigBlind)}
        </span>
        <span className="text-muted">{new Date(hand.playedAt).toLocaleString()}</span>
        <span className={`font-mono font-semibold ${hand.heroNet > 0 ? 'text-good' : hand.heroNet < 0 ? 'text-danger' : 'text-muted'}`}>
          {formatMoney(hand.heroNet, { signed: true })}
        </span>
        {hand.rake > 0 && <span className="text-muted">rake {formatMoney(hand.rake)}</span>}
      </div>

      {!replay.matchesRecord && (
        <p role="alert" className="rounded-lg border border-danger/60 bg-danger/10 px-3 py-2 text-sm">
          This replay does not match the stored record exactly (it may come from an older engine version).
        </p>
      )}

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <TableView view={view} />
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3">
            <button type="button" className={btn} onClick={() => setStep(0)} disabled={step === 0} aria-label="First step">
              ⏮
            </button>
            <button type="button" className={btn} onClick={() => setStep(step - 1)} disabled={step === 0} aria-label="Previous step">
              ◀
            </button>
            <span className="min-w-24 text-center font-mono text-sm">
              {step === 0 ? 'Dealt' : `Action ${step}`} / {last}
            </span>
            <button type="button" className={btn} onClick={() => setStep(step + 1)} disabled={step === last} aria-label="Next step">
              ▶
            </button>
            <button type="button" className={btn} onClick={() => setStep(last)} disabled={step === last} aria-label="Last step">
              ⏭
            </button>
            <label className="ml-auto flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={revealAll} onChange={(e) => setRevealAll(e.target.checked)} />
              Show all cards
            </label>
          </div>
        </div>
        <aside className="lg:w-80">
          <ActionLog
            events={current.events}
            name={name}
            showHoleCards={(seat) => seat === replay.heroSeat || revealAll}
          />
        </aside>
      </div>
    </div>
  );
}
