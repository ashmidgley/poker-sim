import { randInt, streamRng } from './rng';

export const BOT_REBUY_BB = 100;
export const MIN_BUY_IN_BB = 40;
export const MAX_BUY_IN_BB = 200;
export const DEFAULT_BUY_IN_BB = 100;

/**
 * Next button: the next seat clockwise (higher seat number, wrapping) that is
 * dealt into the next hand. No dead button or dead blinds (PLAN 4.3).
 */
export function nextButton(previousButton: number, seatsInNextHand: readonly number[]): number {
  if (seatsInNextHand.length === 0) throw new Error('No seats in the next hand');
  const sorted = [...seatsInNextHand].sort((a, b) => a - b);
  return sorted.find((s) => s > previousButton) ?? sorted[0];
}

/** First hand's button, chosen with the session seed. */
export function initialButton(sessionSeed: string, seats: readonly number[]): number {
  const sorted = [...seats].sort((a, b) => a - b);
  return sorted[randInt(streamRng(sessionSeed, 0, 'button'), sorted.length)];
}

export interface TablePlayer {
  seat: number;
  isHuman: boolean;
  stack: number;
}

/** Bots with an empty stack rebuy to 100 big blinds before the next hand. */
export function botRebuys(players: readonly TablePlayer[], bigBlind: number): { seat: number; amount: number }[] {
  return players
    .filter((p) => !p.isHuman && p.stack === 0)
    .map((p) => ({ seat: p.seat, amount: BOT_REBUY_BB * bigBlind }));
}

export function buyInLimits(bigBlind: number): { min: number; max: number; default: number } {
  return { min: MIN_BUY_IN_BB * bigBlind, max: MAX_BUY_IN_BB * bigBlind, default: DEFAULT_BUY_IN_BB * bigBlind };
}

/** Largest top-up allowed between hands (stack may not exceed 200 big blinds). */
export function maxTopUp(stack: number, bigBlind: number): number {
  return Math.max(0, MAX_BUY_IN_BB * bigBlind - stack);
}
