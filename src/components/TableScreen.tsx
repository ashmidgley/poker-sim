'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import type { KeyValueStore } from '@/data/kv';
import type { Repository } from '@/data/repository';
import { useTable } from '@/game/controller';
import type { LiveState } from '@/game/liveState';
import type { SessionConfig } from '@/game/session';
import { buildTableView, withLearning } from '@/game/tableView';
import { useLearning } from '@/game/useLearning';
import { formatMoney, formatStakes } from '@/lib/format';
import { ActionControls } from './ActionControls';
import { ActionLog } from './ActionLog';
import { BetweenHands } from './BetweenHands';
import { LearningPanel } from './LearningPanel';
import { TableView } from './TableView';

export function TableScreen({
  config,
  repo,
  store,
  initial,
}: {
  config: SessionConfig;
  repo: Repository;
  store: KeyValueStore;
  initial: LiveState | null;
}) {
  const router = useRouter();
  const t = useTable(config, { repo, store, initial });
  const { state, hand, legal, heroSeat, heroToAct, inProgress } = t;
  const name = useCallback(
    (seat: number) => state.players.find((p) => p.seat === seat)?.name ?? `Seat ${seat}`,
    [state.players],
  );
  const learning = useLearning(hand, { enabled: config.learningMode, heroSeat, name, heroToAct });
  const view = useMemo(
    () => withLearning(buildTableView(state, { revealAll: config.learningMode }), learning),
    [state, config.learningMode, learning],
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
        {config.learningMode && (
          <span className="rounded-full border border-good/60 bg-good/10 px-2 py-0.5 text-xs text-good" title="Results do not count toward your bankroll or stats">
            Learning mode: play money
          </span>
        )}
        <span className="text-muted">
          Stack <span className="font-mono text-foreground">{formatMoney(heroStack)}</span>
        </span>
        <div className="ml-auto flex items-center gap-3">
          <Link href="/" className="text-muted hover:text-foreground" title="The session stays open; resume it from the lobby">
            Lobby
          </Link>
          <button
            type="button"
            disabled={t.busy}
            onClick={async () => {
              if (await t.endSession()) router.push('/');
            }}
            className="rounded-md border border-line px-2.5 py-1 text-muted hover:text-foreground disabled:opacity-50"
            title={inProgress ? 'The hand in progress will be void' : undefined}
          >
            Cash out {formatMoney(inProgress ? (heroHandSeat?.startingStack ?? heroStack) : heroStack)}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <TableView view={view} roomy={config.learningMode} />
          {config.learningMode && <LearningPanel learning={learning} />}
          {t.notice && (
            <div role="status" className="flex items-center justify-between rounded-lg border border-accent/60 bg-accent/10 px-3 py-2 text-sm">
              <span>{t.notice}</span>
              <button type="button" onClick={t.clearNotice} className="text-muted hover:text-foreground">
                Dismiss
              </button>
            </div>
          )}
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
              busy={t.busy}
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
