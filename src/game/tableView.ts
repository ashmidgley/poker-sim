import { PROFILES } from '@/bots';
import { blindSeats, type HandEvent, type Pot, type SeatState } from '@/engine';
import { formatMoney } from '@/lib/format';
import type { SeatViewModel } from '@/components/SeatView';
import type { TableState } from './tableReducer';
import type { Learning } from './useLearning';

const ACTION_WORD = { fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise' } as const;

export interface TableViewModel {
  seats: SeatViewModel[];
  bets: Map<number, number>; // seat -> chips in front this street
  potTotal: number;
  pots: Pot[]; // live pots (only meaningful when > 1)
  board: string[];
  awards: Extract<HandEvent, { type: 'pot_awarded' }>[];
  rake: number;
}

/**
 * Pots during a hand. Bets that are still open are not side-pot levels, so
 * only all-in amounts split the pot; everything above the largest all-in is
 * the current (open) pot. Final pots come from the engine at hand end.
 */
export function livePots(seats: readonly SeatState[]): Pot[] {
  const allInLevels = [...new Set(seats.filter((s) => s.status === 'allIn').map((s) => s.committedHand))].sort(
    (a, b) => a - b,
  );
  const maxCommitted = Math.max(0, ...seats.map((s) => s.committedHand));
  const levels = [...allInLevels.filter((l) => l < maxCommitted), Infinity];
  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const s of seats) amount += Math.min(s.committedHand, level) - Math.min(s.committedHand, prev);
    // Active seats can still match any level; all-in seats only up to what they put in.
    const eligible = seats.filter((s) => s.status === 'active' || (s.status === 'allIn' && s.committedHand >= level));
    if (amount > 0) pots.push({ amount, eligible: eligible.map((s) => s.seat) });
    prev = level;
  }
  return pots;
}

/** Turn table state into what each seat should display. `revealAll` is for learning mode. */
export function buildTableView(state: TableState, opts: { revealAll?: boolean } = {}): TableViewModel {
  const hand = state.hand;
  const events = state.events;
  const complete = hand?.phase === 'complete';
  const blinds = hand ? blindSeats(hand.input) : null;

  const shown = new Map<number, string>();
  const won = new Map<number, number>();
  const awards: Extract<HandEvent, { type: 'pot_awarded' }>[] = [];
  let rake = 0;
  const lastAction = new Map<number, string>();
  for (const e of events) {
    if (e.type === 'showdown') shown.set(e.seat, e.description);
    if (e.type === 'pot_awarded') {
      awards.push(e);
      for (const w of e.winners) won.set(w.seat, (won.get(w.seat) ?? 0) + w.amount);
    }
    if (e.type === 'rake_taken') rake = e.amount;
    if (e.type === 'street_dealt') lastAction.clear();
    if (e.type === 'action') {
      const amount = e.action === 'call' ? ` ${formatMoney(e.added)}` : e.action === 'bet' || e.action === 'raise' ? ` ${formatMoney(e.to)}` : '';
      lastAction.set(e.seat, `${ACTION_WORD[e.action]}${amount}`);
    }
  }

  const seats: SeatViewModel[] = state.players.map((p) => {
    const hs = hand?.seats.find((s) => s.seat === p.seat);
    const inHand = !!hs;
    const folded = hs?.status === 'folded';
    return {
      seat: p.seat,
      name: p.name,
      isHuman: p.isHuman,
      stack: hs ? hs.stack : p.stack,
      inHand,
      folded,
      allIn: hs?.status === 'allIn' && !complete,
      toAct: !!hand && hand.toAct === p.seat,
      isButton: hand?.input.buttonSeat === p.seat,
      blind: blinds?.sb === p.seat ? 'SB' : blinds?.bb === p.seat ? 'BB' : null,
      cards: hs ? hs.holeCards : null,
      showCards: !!hs && (p.isHuman || shown.has(p.seat) || !!opts.revealAll),
      lastAction: folded ? 'Folded' : (lastAction.get(p.seat) ?? null),
      won: won.get(p.seat) ?? 0,
      handLabel: shown.get(p.seat) ?? null,
      styleLabel: opts.revealAll && p.profile ? PROFILES[p.profile].label : null,
    };
  });

  const bets = new Map<number, number>();
  if (hand && !complete) for (const s of hand.seats) if (s.committedStreet > 0) bets.set(s.seat, s.committedStreet);

  const potTotal = hand && !complete ? hand.seats.reduce((a, s) => a + s.committedHand, 0) : 0;
  const pots = hand && !complete ? livePots(hand.seats) : [];

  return { seats, bets, potTotal, pots, board: hand?.board ?? [], awards, rake };
}

/** Merge learning-mode analysis (win %, leader, made hand, outs) into the seat view models. */
export function withLearning(view: TableViewModel, learning: Learning | null): TableViewModel {
  if (!learning) return view;
  return {
    ...view,
    seats: view.seats.map((seat) => {
      const l = learning.seats.get(seat.seat);
      return l ? { ...seat, learning: { winPct: l.winPct, leader: l.leader, madeHand: l.madeHand, outs: l.outs } } : seat;
    }),
  };
}
