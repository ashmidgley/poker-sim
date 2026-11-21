'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { buildBotView, decide, PROFILES } from '@/bots';
import { hashSeed, legalActions, maxTopUp, mulberry32, type Action } from '@/engine';
import type { KeyValueStore } from '@/data/kv';
import type { Repository } from '@/data/repository';
import { summarize } from '@/data/summarize';
import { DataError } from '@/data/types';
import { formatMoney } from '@/lib/format';
import { clearLiveState, saveLiveState, type LiveState } from './liveState';
import { newId, type SessionConfig } from './session';
import { heroNeedsRebuy, isHandInProgress, restoreTableState, tableReducer, toLiveState } from './tableReducer';

export const BOT_DELAY_MIN_MS = 400;
export const BOT_DELAY_MAX_MS = 900;

function describeError(e: unknown): string {
  if (e instanceof DataError) {
    if (e.code === 'insufficient_bankroll') return 'Your bankroll cannot cover that.';
    if (e.code === 'unauthorized') return 'Locked: unlock the app to keep saving.';
    if (e.code === 'session_ended') return 'This session has already ended.';
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

/**
 * Owns a table session: stacks, button, hand number and the current hand.
 * Bots act on their own after a short delay; the human acts through `act`.
 * Every completed hand is saved through the repository, and the table state
 * is kept in browser storage so a refresh resumes at the next hand.
 */
export function useTable(config: SessionConfig, deps: { repo: Repository; store: KeyValueStore; initial: LiveState | null }) {
  const { repo, store } = deps;
  const [state, dispatch] = useReducer(tableReducer, undefined, () => restoreTableState(config, deps.initial));
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const savedHands = useRef(new Set<string>());

  const hand = state.hand;
  const legal = hand ? legalActions(hand) : null;
  const heroSeat = state.players.find((p) => p.isHuman)!.seat;
  const heroToAct = legal !== null && legal.seat === heroSeat;
  const inProgress = isHandInProgress(state);

  // Drive bot turns.
  useEffect(() => {
    if (!hand) return;
    const botLegal = legalActions(hand);
    if (!botLegal || botLegal.seat === heroSeat) return;
    // Stateless, reproducible bot randomness: one stream per decision.
    const rng = mulberry32(hashSeed(`${config.seed}:${hand.input.handNumber}:bots:${hand.actions.length}`));
    const delay = BOT_DELAY_MIN_MS + Math.floor(rng() * (BOT_DELAY_MAX_MS - BOT_DELAY_MIN_MS));
    const profile = state.players.find((p) => p.seat === botLegal.seat)?.profile ?? 'tag';
    const timer = setTimeout(() => {
      dispatch({ type: 'act', action: decide(buildBotView(hand), PROFILES[profile], rng) });
    }, delay);
    return () => clearTimeout(timer);
  }, [hand, heroSeat, config.seed, state.players]);

  // Keep resume state current: when a hand starts (pre-hand stacks) and when it ends.
  const phaseKey = hand ? `${hand.input.handId}:${hand.phase === 'complete'}` : 'none';
  useEffect(() => {
    if (!hand) return;
    saveLiveState(store, config.id, toLiveState(state));
    // Only on hand start and hand end, not on every action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseKey]);

  // Save each completed hand once.
  useEffect(() => {
    if (!hand || hand.phase !== 'complete' || savedHands.current.has(hand.input.handId)) return;
    savedHands.current.add(hand.input.handId);
    const stored = summarize(state.events, {
      sessionId: config.id,
      playedAt: new Date().toISOString(),
      learningMode: config.learningMode,
      heroSeat,
    });
    repo.saveHand(stored).catch((e) => setNotice(`Hand #${hand.input.handNumber} was not saved: ${describeError(e)}`));
  }, [hand, state.events, repo, config.id, config.learningMode, heroSeat]);

  const startHand = useCallback(() => {
    setNotice(null);
    dispatch({ type: 'startHand', handId: newId() });
  }, []);
  const act = useCallback((action: Action) => dispatch({ type: 'act', action }), []);
  const clearError = useCallback(() => dispatch({ type: 'clearError' }), []);

  /** Rebuy or top up: charged to the bankroll first, then added to the stack. */
  const rebuy = useCallback(
    async (requested: number) => {
      const hero = state.players.find((p) => p.isHuman)!;
      const amount = Math.min(requested, maxTopUp(hero.stack, config.bigBlind));
      if (amount <= 0 || busy) return;
      setBusy(true);
      try {
        await repo.rebuy(config.id, amount);
        dispatch({ type: 'rebuy', amount });
        const live = toLiveState(state); // between hands, so these are the current stacks
        saveLiveState(store, config.id, { ...live, stacks: { ...live.stacks, [hero.seat]: hero.stack + amount } });
        setNotice(null);
      } catch (e) {
        setNotice(`Rebuy of ${formatMoney(amount)} failed: ${describeError(e)}`);
      } finally {
        setBusy(false);
      }
    },
    [state, repo, store, config.id, config.bigBlind, busy],
  );

  /**
   * Cash out the hero's stack and close the session. A hand in progress is
   * void, so the cash-out is the hero's stack from before it.
   */
  const endSession = useCallback(async (): Promise<boolean> => {
    const live = toLiveState(state);
    const cashOut = live.stacks[heroSeat] ?? 0;
    setBusy(true);
    try {
      await repo.endSession(config.id, cashOut);
      clearLiveState(store, config.id);
      return true;
    } catch (e) {
      setNotice(`Could not end the session: ${describeError(e)}`);
      return false;
    } finally {
      setBusy(false);
    }
  }, [state, heroSeat, repo, store, config.id]);

  return {
    state,
    hand,
    legal,
    heroSeat,
    heroToAct,
    inProgress,
    needsRebuy: heroNeedsRebuy(state),
    notice,
    busy,
    startHand,
    act,
    rebuy,
    endSession,
    clearError,
    clearNotice: () => setNotice(null),
  };
}

export type TableController = ReturnType<typeof useTable>;
