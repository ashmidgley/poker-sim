import type { Card } from './cards';
import { shuffledDeck } from './deck';
import { describeScore } from './describe';
import { evaluate } from './evaluator';
import { IllegalActionError, legalActions, seatByNumber } from './legal';
import { buildPots, returnUncalled, splitPot } from './pots';
import { computeRake, deductRake } from './rake';
import { streamRng } from './rng';
import type { Action, HandEvent, HandResult, HandState, NewHandInput, Phase, SeatState, Street } from './types';

// ---------- seat navigation ----------

/** Seats clockwise after `fromSeat` (wrapping), ending with `fromSeat` itself if present. */
function clockwiseFrom(state: HandState, fromSeat: number): SeatState[] {
  const sorted = state.seats;
  const start = sorted.findIndex((s) => s.seat > fromSeat);
  const i0 = start === -1 ? 0 : start;
  return [...sorted.slice(i0), ...sorted.slice(0, i0)];
}

function firstLeftOf(state: HandState, fromSeat: number, pred: (s: SeatState) => boolean): SeatState | null {
  return clockwiseFrom(state, fromSeat).find(pred) ?? null;
}

export function blindSeats(input: Pick<NewHandInput, 'buttonSeat' | 'seats'>): { sb: number; bb: number } {
  const seats = [...input.seats].map((s) => s.seat).sort((a, b) => a - b);
  const left = (from: number) => seats.find((s) => s > from) ?? seats[0];
  if (seats.length === 2) return { sb: input.buttonSeat, bb: left(input.buttonSeat) };
  const sb = left(input.buttonSeat);
  return { sb, bb: left(sb) };
}

// ---------- helpers ----------

function cloneState(state: HandState): HandState {
  return {
    ...state,
    seats: state.seats.map((s) => ({ ...s, holeCards: [s.holeCards[0], s.holeCards[1]] })),
    deck: state.deck.slice(),
    board: state.board.slice(),
    actions: state.actions.slice(),
  };
}

function potTotal(state: HandState): number {
  return state.seats.reduce((sum, s) => sum + s.committedHand, 0);
}

function commit(seat: SeatState, amount: number): void {
  seat.stack -= amount;
  seat.committedStreet += amount;
  seat.committedHand += amount;
  if (seat.stack === 0) seat.status = 'allIn';
}

function needsToAct(state: HandState, s: SeatState): boolean {
  return s.status === 'active' && (!s.actedThisStreet || s.committedStreet < state.currentBet);
}

function streetClosed(state: HandState): boolean {
  const active = state.seats.filter((s) => s.status === 'active');
  if (active.length === 0) return true;
  // A lone active seat with nothing to call has no one to bet against.
  if (active.length === 1 && active[0].committedStreet >= state.currentBet) return true;
  return active.every((s) => s.actedThisStreet && s.committedStreet === state.currentBet);
}

function resetStreet(state: HandState): void {
  for (const s of state.seats) {
    s.committedStreet = 0;
    s.actedThisStreet = false;
    s.raiseRightsOpen = true;
  }
  state.currentBet = 0;
  state.lastFullRaiseSize = state.input.config.bigBlind;
  state.lastAggressor = null;
}

const NEXT_STREET: Record<'preflop' | 'flop' | 'turn', 'flop' | 'turn' | 'river'> = {
  preflop: 'flop',
  flop: 'turn',
  turn: 'river',
};

function dealNextStreet(state: HandState, events: HandEvent[]): void {
  const street = NEXT_STREET[state.phase as 'preflop' | 'flop' | 'turn'];
  const count = street === 'flop' ? 3 : 1;
  const cards = state.deck.splice(0, count);
  state.board.push(...cards);
  state.phase = street;
  if (street === 'flop') state.flopDealt = true;
  resetStreet(state);
  events.push({ type: 'street_dealt', street, cards, board: state.board.slice() });
}

// ---------- hand end ----------

function finishHand(state: HandState, events: HandEvent[], showdown: boolean): void {
  const pots = buildPots(state.seats);
  const total = pots.reduce((sum, p) => sum + p.amount, 0);
  const rake = computeRake(total, state.input.config.rake, state.flopDealt);
  if (rake > 0) {
    const fromPots = deductRake(pots, rake);
    events.push({ type: 'rake_taken', amount: rake, fromPots });
  }
  state.rake = rake;

  const contenders = state.seats.filter((s) => s.status !== 'folded');
  const scores = new Map<number, number>();

  if (showdown) {
    for (const s of contenders) scores.set(s.seat, evaluate([...s.holeCards, ...state.board]));
    const first =
      state.lastAggressor !== null && contenders.some((s) => s.seat === state.lastAggressor)
        ? state.lastAggressor
        : firstLeftOf(state, state.input.buttonSeat, (s) => s.status !== 'folded')!.seat;
    const order = [seatByNumber(state, first), ...clockwiseFrom(state, first).filter((s) => s.seat !== first)].filter(
      (s) => s.status !== 'folded',
    );
    for (const s of order) {
      events.push({ type: 'showdown', seat: s.seat, cards: s.holeCards, description: describeScore(scores.get(s.seat)!) });
    }
  }

  pots.forEach((pot, potIndex) => {
    let winners: number[];
    let description: string | null = null;
    if (showdown) {
      const best = Math.max(...pot.eligible.map((seat) => scores.get(seat)!));
      winners = pot.eligible.filter((seat) => scores.get(seat) === best);
      description = describeScore(best);
    } else {
      winners = pot.eligible;
    }
    const shares = splitPot(pot.amount, winners, state.input.buttonSeat);
    for (const w of shares) seatByNumber(state, w.seat).stack += w.amount;
    events.push({ type: 'pot_awarded', potIndex, amount: pot.amount, winners: shares, description });
  });

  for (const s of state.seats) {
    s.committedStreet = 0;
    s.committedHand = 0;
  }
  state.phase = 'complete';
  state.toAct = null;
  events.push({
    type: 'hand_completed',
    stacks: state.seats.map((s) => ({ seat: s.seat, stack: s.stack, net: s.stack - s.startingStack })),
    rake,
  });
}

/**
 * Move the hand forward after blinds or an action: close streets, deal,
 * run out boards, finish the hand, or pick the next seat to act.
 */
function progress(state: HandState, events: HandEvent[], lastActor: number): void {
  for (;;) {
    const contenders = state.seats.filter((s) => s.status !== 'folded');
    if (contenders.length === 1) {
      const ev = returnUncalled(state.seats);
      if (ev) events.push(ev);
      finishHand(state, events, false);
      return;
    }

    if (!streetClosed(state)) {
      const next = firstLeftOf(state, lastActor, (s) => needsToAct(state, s));
      if (!next) throw new Error('Invariant: street open but no seat to act');
      state.toAct = next.seat;
      return;
    }

    const ev = returnUncalled(state.seats);
    if (ev) events.push(ev);
    state.toAct = null;

    if (state.phase === 'river') {
      finishHand(state, events, true);
      return;
    }

    const activeCount = state.seats.filter((s) => s.status === 'active').length;
    if (activeCount <= 1) {
      events.push({
        type: 'all_in_runout',
        seats: contenders.map((s) => ({ seat: s.seat, cards: s.holeCards })),
      });
      // dealNextStreet advances state.phase; the cast stops TS narrowing it away.
      while ((state.phase as Phase) !== 'river') dealNextStreet(state, events);
      finishHand(state, events, true);
      return;
    }

    dealNextStreet(state, events);
    // Postflop action starts with the first active seat left of the button.
    lastActor = state.input.buttonSeat;
  }
}

// ---------- public API ----------

export function createHand(input: NewHandInput): HandResult {
  const seatsIn = [...input.seats].sort((a, b) => a.seat - b.seat);
  if (seatsIn.length < 2 || seatsIn.length > 9) throw new Error('A hand needs 2 to 9 seats');
  if (new Set(seatsIn.map((s) => s.seat)).size !== seatsIn.length) throw new Error('Duplicate seat numbers');
  if (seatsIn.some((s) => !Number.isInteger(s.stack) || s.stack <= 0)) throw new Error('Every stack must be > 0');
  if (!seatsIn.some((s) => s.seat === input.buttonSeat)) throw new Error('Button seat is not in the hand');
  const { smallBlind, bigBlind } = input.config;
  if (!(smallBlind > 0 && bigBlind >= smallBlind)) throw new Error('Bad blinds');

  const deck = shuffledDeck(streamRng(input.sessionSeed, input.handNumber, 'deck'));
  const state: HandState = {
    input,
    seats: seatsIn.map((s) => ({
      ...s,
      startingStack: s.stack,
      holeCards: ['', ''] as [Card, Card],
      status: 'active',
      committedStreet: 0,
      committedHand: 0,
      actedThisStreet: false,
      raiseRightsOpen: true,
    })),
    deck,
    board: [],
    phase: 'preflop',
    currentBet: 0,
    lastFullRaiseSize: bigBlind,
    toAct: null,
    lastAggressor: null,
    flopDealt: false,
    rake: 0,
    actions: [],
  };

  const events: HandEvent[] = [
    {
      type: 'hand_started',
      handId: input.handId,
      handNumber: input.handNumber,
      sessionSeed: input.sessionSeed,
      config: input.config,
      buttonSeat: input.buttonSeat,
      seats: seatsIn.map(({ seat, playerId, name, isHuman, stack }) => ({ seat, playerId, name, isHuman, stack })),
    },
  ];

  const { sb, bb } = blindSeats(input);
  for (const [seatNo, kind, blind] of [
    [sb, 'sb', smallBlind],
    [bb, 'bb', bigBlind],
  ] as const) {
    const s = seatByNumber(state, seatNo);
    const amount = Math.min(blind, s.stack);
    commit(s, amount);
    events.push({ type: 'blind_posted', seat: seatNo, kind, amount, allIn: s.stack === 0 });
  }
  state.currentBet = bigBlind;

  // Deal one card at a time, starting left of the button.
  const dealOrder = clockwiseFrom(state, input.buttonSeat);
  for (let round = 0; round < 2; round++) {
    for (const s of dealOrder) s.holeCards[round] = state.deck.shift()!;
  }
  for (const s of state.seats) events.push({ type: 'hole_cards_dealt', seat: s.seat, cards: [s.holeCards[0], s.holeCards[1]] });

  // Preflop action starts with the first active seat left of the big blind.
  progress(state, events, bb);
  return { state, events };
}

export function applyAction(prev: HandState, action: Action): HandResult {
  const legal = legalActions(prev);
  if (!legal) throw new IllegalActionError('The hand is complete');
  if (action.seat !== legal.seat) throw new IllegalActionError(`It is seat ${legal.seat}'s turn, not seat ${action.seat}'s`);

  const state = cloneState(prev);
  const events: HandEvent[] = [];
  const s = seatByNumber(state, action.seat);
  const street = state.phase as Street;
  const toCall = state.currentBet - s.committedStreet;
  let added = 0;

  switch (action.type) {
    case 'fold':
      s.status = 'folded';
      break;
    case 'check':
      if (!legal.canCheck) throw new IllegalActionError('Cannot check when facing a bet');
      break;
    case 'call':
      if (legal.canCheck) throw new IllegalActionError('Nothing to call; check instead');
      added = Math.min(toCall, s.stack);
      commit(s, added);
      break;
    case 'bet':
    case 'raise': {
      const r = legal.raise;
      if (!r) throw new IllegalActionError('Raising is not allowed here');
      if (r.kind !== action.type) throw new IllegalActionError(`Use '${r.kind}', not '${action.type}'`);
      if (!Number.isInteger(action.to) || action.to < r.minTo || action.to > r.maxTo) {
        throw new IllegalActionError(`${action.type} to ${action.to} is outside ${r.minTo}..${r.maxTo}`);
      }
      added = action.to - s.committedStreet;
      const raiseSize = action.to - state.currentBet;
      commit(s, added);
      if (raiseSize >= state.lastFullRaiseSize) {
        state.lastFullRaiseSize = raiseSize;
        for (const o of state.seats) {
          if (o.seat !== s.seat && o.status === 'active') {
            o.raiseRightsOpen = true;
            o.actedThisStreet = false;
          }
        }
      }
      state.currentBet = action.to;
      state.lastAggressor = s.seat;
      break;
    }
  }

  s.actedThisStreet = true;
  s.raiseRightsOpen = false;
  state.actions.push(action);
  events.push({
    type: 'action',
    street,
    seat: s.seat,
    action: action.type,
    added,
    to: s.committedStreet,
    allIn: s.status === 'allIn',
    potAfter: potTotal(state),
  });

  progress(state, events, s.seat);
  return { state, events };
}
