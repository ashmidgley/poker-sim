import { parseCards, type Card } from '../cards';
import { fullDeck } from '../deck';
import { applyAction, createHand } from '../hand';
import type { Action, HandEvent, HandState, NewHandInput, RakeConfig } from '../types';

export const NO_RAKE: RakeConfig = { percentBps: 0, cap: 0, roundTo: 1, noFlopNoDrop: true };

export function makeInput(
  stacks: number[],
  opts: { button?: number; sb?: number; bb?: number; rake?: RakeConfig; seed?: string; handNumber?: number } = {},
): NewHandInput {
  return {
    handId: 'test-hand',
    handNumber: opts.handNumber ?? 1,
    sessionSeed: opts.seed ?? 'test-seed',
    buttonSeat: opts.button ?? 0,
    config: { smallBlind: opts.sb ?? 100, bigBlind: opts.bb ?? 200, rake: opts.rake ?? NO_RAKE },
    seats: stacks.map((stack, seat) => ({ seat, playerId: `p${seat}`, name: `Seat ${seat}`, isHuman: seat === 0, stack })),
  };
}

/**
 * Create a hand, then replace the dealt hole cards and the undealt deck so the
 * board comes out as given. Only valid while no street has been dealt.
 */
export function riggedHand(input: NewHandInput, holes: string[], board: string): { state: HandState; events: HandEvent[] } {
  const { state, events } = createHand(input);
  if (state.board.length !== 0) throw new Error('Rig before the flop');
  const used: Card[] = [];
  state.seats.forEach((s, i) => {
    const cards = parseCards(holes[i]) as [Card, Card];
    s.holeCards = cards;
    used.push(...cards);
  });
  const boardCards = parseCards(board);
  used.push(...boardCards);
  state.deck = [...boardCards, ...fullDeck().filter((c) => !used.includes(c))];
  return { state, events };
}

/** Apply a list of actions, collecting events. */
export function play(start: { state: HandState; events: HandEvent[] }, actions: Action[]) {
  let state = start.state;
  const events = [...start.events];
  for (const a of actions) {
    const r = applyAction(state, a);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

export function eventsOf<T extends HandEvent['type']>(events: HandEvent[], type: T): Extract<HandEvent, { type: T }>[] {
  return events.filter((e): e is Extract<HandEvent, { type: T }> => e.type === type);
}

export const stackOf = (state: HandState, seat: number) => state.seats.find((s) => s.seat === seat)!.stack;
