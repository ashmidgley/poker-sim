import { BOT_ITERATIONS, equityVsRandom, type Action, type Rng } from '@/engine';
import { chenScore } from './chen';
import type { BotProfile } from './profiles';
import type { BotView } from './view';

type Intent = { kind: 'fold' } | { kind: 'check' } | { kind: 'call' } | { kind: 'raise'; to: number };

const ALL_IN_CHEN = 16;
const POT_FRACTIONS = [1 / 3, 2 / 3, 1] as const;

/** "Late" is the button and the seat before it (PLAN 5.2). */
export function isLatePosition(view: BotView): boolean {
  if (view.seat === view.buttonSeat) return true;
  const seats = view.seats.map((s) => s.seat);
  const i = seats.indexOf(view.buttonSeat);
  const beforeButton = seats[(i - 1 + seats.length) % seats.length];
  return view.seat === beforeButton;
}

function preflopIntent(view: BotView, profile: BotProfile): Intent {
  const p = profile.preflop;
  const chen = chenScore(view.holeCards);
  const actions = view.history.filter((a) => a.street === 'preflop');
  const raises = actions.filter((a) => a.action === 'bet' || a.action === 'raise');
  const firstRaise = actions.findIndex((a) => a.action === 'bet' || a.action === 'raise');
  const limpers = (firstRaise === -1 ? actions : actions.slice(0, firstRaise)).filter((a) => a.action === 'call').length;
  const iRaised = raises.some((a) => a.seat === view.seat);

  if (raises.length === 0) {
    const open = isLatePosition(view) ? p.openLate : p.openEarly;
    if (chen >= open) return { kind: 'raise', to: (p.openSizeBb + limpers) * view.bigBlind };
    if (view.legal.canCheck) return { kind: 'check' }; // big blind option
    if (p.limp !== null && chen >= p.limp) return { kind: 'call' };
    return { kind: 'fold' };
  }

  if (raises.length === 1 && !iRaised) {
    if (chen >= p.reraise) return { kind: 'raise', to: 3 * view.currentBet };
    if (chen >= p.callRaise) return { kind: 'call' };
    return { kind: 'fold' };
  }

  // Facing a re-raise after raising, or facing two or more raises cold.
  if (chen >= ALL_IN_CHEN) return { kind: 'raise', to: Number.MAX_SAFE_INTEGER };
  if (chen >= p.reraise) return { kind: 'call' };
  return { kind: 'fold' };
}

function pickBetSize(view: BotView, profile: BotProfile, rng: Rng): number {
  const w = profile.postflop.sizeWeights;
  let roll = rng() * (w[0] + w[1] + w[2]);
  let i = 0;
  while (i < 2 && roll >= w[i]) roll -= w[i++];
  return POT_FRACTIONS[i] * view.pot;
}

function postflopIntent(view: BotView, profile: BotProfile, rng: Rng): Intent {
  const pf = profile.postflop;
  const opponents = view.seats.filter((s) => s.status !== 'folded' && s.seat !== view.seat).length;
  const equity = equityVsRandom(view.holeCards, view.board, opponents, BOT_ITERATIONS, rng).equity;

  if (view.toCall === 0) {
    if (equity >= pf.valueBet) {
      if (rng() < pf.betChance) return { kind: 'raise', to: pickBetSize(view, profile, rng) };
    } else if (rng() < pf.bluff) {
      return { kind: 'raise', to: pickBetSize(view, profile, rng) };
    }
    return { kind: 'check' };
  }

  const potOdds = view.toCall / (view.pot + view.toCall);
  if (equity >= pf.raise && rng() < pf.betChance) return { kind: 'raise', to: 3 * view.currentBet };
  if (equity >= potOdds + pf.callMargin) return { kind: 'call' };
  return { kind: 'fold' };
}

/**
 * Turn an intent into a legal action. Sizes are rounded to whole dollars at
 * normal stakes and clamped into [minTo, maxTo]. When the intent is not
 * legal, fall back to call, then check, then fold. A bot never folds when it
 * could check for free.
 */
export function toLegalAction(intent: Intent, view: BotView): Action {
  const { legal } = view;
  const seat = legal.seat;
  const checkOrFold: Action = legal.canCheck ? { type: 'check', seat } : { type: 'fold', seat };
  const callOrCheck: Action = legal.canCheck ? { type: 'check', seat } : { type: 'call', seat };

  switch (intent.kind) {
    case 'raise': {
      if (!legal.raise) return callOrCheck;
      const unit = view.bigBlind >= 100 ? 100 : 1;
      const rounded = Math.round(intent.to / unit) * unit;
      const to = Math.min(legal.raise.maxTo, Math.max(legal.raise.minTo, rounded));
      return { type: legal.raise.kind, seat, to };
    }
    case 'call':
      return callOrCheck;
    case 'check':
      return checkOrFold;
    case 'fold':
      return checkOrFold;
  }
}

export function decide(view: BotView, profile: BotProfile, rng: Rng): Action {
  const intent = view.street === 'preflop' ? preflopIntent(view, profile) : postflopIntent(view, profile, rng);
  return toLegalAction(intent, view);
}
