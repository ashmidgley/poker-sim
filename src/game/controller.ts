'use client';

import { useCallback, useEffect, useReducer } from 'react';
import { hashSeed, legalActions, mulberry32, type Action } from '@/engine';
import { placeholderDecide } from './placeholderBot';
import { newId, type SessionConfig } from './session';
import { heroNeedsRebuy, initialTableState, isHandInProgress, tableReducer } from './tableReducer';

export const BOT_DELAY_MIN_MS = 400;
export const BOT_DELAY_MAX_MS = 900;

/**
 * Owns a table session: stacks, button, hand number and the current hand.
 * Bots act on their own after a short delay; the human acts through `act`.
 */
export function useTable(config: SessionConfig) {
  const [state, dispatch] = useReducer(tableReducer, config, initialTableState);
  const hand = state.hand;
  const legal = hand ? legalActions(hand) : null;
  const heroSeat = state.players.find((p) => p.isHuman)!.seat;
  const heroToAct = legal !== null && legal.seat === heroSeat;

  // Drive bot turns.
  useEffect(() => {
    if (!hand) return;
    const botLegal = legalActions(hand);
    if (!botLegal || botLegal.seat === heroSeat) return;
    // Stateless, reproducible bot randomness: one stream per decision.
    const rng = mulberry32(hashSeed(`${config.seed}:${hand.input.handNumber}:bots:${hand.actions.length}`));
    const delay = BOT_DELAY_MIN_MS + Math.floor(rng() * (BOT_DELAY_MAX_MS - BOT_DELAY_MIN_MS));
    const timer = setTimeout(() => {
      dispatch({ type: 'act', action: placeholderDecide(botLegal, rng) });
    }, delay);
    return () => clearTimeout(timer);
  }, [hand, heroSeat, config.seed]);

  const startHand = useCallback(() => dispatch({ type: 'startHand', handId: newId() }), []);
  const act = useCallback((action: Action) => dispatch({ type: 'act', action }), []);
  const rebuy = useCallback((amount: number) => dispatch({ type: 'rebuy', amount }), []);
  const clearError = useCallback(() => dispatch({ type: 'clearError' }), []);

  return {
    state,
    hand,
    legal,
    heroSeat,
    heroToAct,
    inProgress: isHandInProgress(state),
    needsRebuy: heroNeedsRebuy(state),
    startHand,
    act,
    rebuy,
    clearError,
  };
}

export type TableController = ReturnType<typeof useTable>;
