'use client';

import Link from 'next/link';
import { useCallback, useMemo } from 'react';
import { useTable } from '@/game/controller';
import type { SessionConfig } from '@/game/session';
import { buildTableView } from '@/game/tableView';
import { formatMoney, formatStakes } from '@/lib/format';
import { ActionControls } from './ActionControls';
import { ActionLog } from './ActionLog';
import { BetweenHands } from './BetweenHands';
import { TableView } from './TableView';

export function TableScreen({ config }: { config: SessionConfig }) {
  const t = useTable(config);
  const { state, hand, legal, heroSeat, heroToAct, inProgress } = t;
  const view = useMemo(() => buildTableView(state, { revealAll: config.learningMode }), [state, config.learningMode]);
  const name = useCallback(
    (seat: number) => state.players.find((p) => p.seat === seat)?.name ?? `Seat ${seat}`,
    [state.players],
  );
  const hero = state.players.find((p) => p.isHuman)!;
  const heroHandSeat = hand?.seats.find((s) => s.seat === heroSeat);
  const heroStack = inProgress && heroHandSeat ? heroHandSeat.stack : hero.stack;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-semibold">${formatStakes(config.smallBlind, config.bigBlind)} No-Limit Hold&apos;em</span>
        <span className="text-muted">{config.opponents} opponent{config.opponents === 1 ? '' : 's'}</span>
        <span className="text-muted">Hand #{state.handNumber}</span>
        <span className="text-muted">
          Stack <span className="font-mono text-foreground">{formatMoney(heroStack)}</span>
        </span>
        <Link href="/" className="ml-auto text-muted hover:text-foreground">
          Leave table
        </Link>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <TableView view={view} />
          {state.error && (
            <div role="alert" className="flex items-center justify-between rounded-lg border border-danger/60 bg-danger/10 px-3 py-2 text-sm">
              <span>{state.error}</span>
              <button type="button" onClick={t.clearError} className="text-muted hover:text-foreground">
                Dismiss
              </button>
            </div>
          )}
          {inProgress ? (
            <ActionControls
              legal={legal}
              enabled={heroToAct}
              pot={view.potTotal}
              currentBet={hand?.currentBet ?? 0}
              committedStreet={heroHandSeat?.committedStreet ?? 0}
              bigBlind={config.bigBlind}
              onAct={t.act}
            />
          ) : (
            <BetweenHands
              key={state.handNumber}
              handNumber={state.handNumber}
              events={state.events}
              heroSeat={heroSeat}
              heroStack={hero.stack}
              bigBlind={config.bigBlind}
              needsRebuy={t.needsRebuy}
              onNext={t.startHand}
              onRebuy={t.rebuy}
            />
          )}
        </div>
        <aside className="lg:w-80">
          <ActionLog events={state.events} name={name} showHoleCards={(seat) => seat === heroSeat || config.learningMode} />
        </aside>
      </div>
    </div>
  );
}
