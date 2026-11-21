import { describe, expect, it } from 'vitest';
import { applyAction, createHand, parseCards, type Action, type Card, type HandEvent, type NewHandInput } from '@/engine';
import { fullDeck } from '@/engine/deck';
import { positionOf, summarize } from '../summarize';
import { handSummarySchema, storedHandSchema } from '../types';

const LIVE = { percentBps: 1000, cap: 600, roundTo: 100, noFlopNoDrop: true };
const SESSION = '11111111-1111-4111-8111-111111111111';
const HAND = '22222222-2222-4222-8222-222222222222';

function input(stacks: number[], button = 0): NewHandInput {
  return {
    handId: HAND,
    handNumber: 7,
    sessionSeed: 'sum',
    buttonSeat: button,
    config: { smallBlind: 100, bigBlind: 200, rake: LIVE },
    seats: stacks.map((stack, seat) => ({ seat, playerId: `p${seat}`, name: `S${seat}`, isHuman: seat === 0, stack })),
  };
}

/** Play a rigged hand: holes per seat, a fixed board, then the given actions. */
function rigged(inp: NewHandInput, holes: string[], board: string, actions: Action[]): HandEvent[] {
  const created = createHand(inp);
  let state = created.state;
  const used: Card[] = [];
  state.seats.forEach((s, i) => {
    s.holeCards = parseCards(holes[i]) as [Card, Card];
    used.push(...s.holeCards);
  });
  const b = parseCards(board);
  state.deck = [...b, ...fullDeck().filter((c) => !used.includes(c) && !b.includes(c))];
  // Re-emit the dealt cards so the log matches the rig.
  const events: HandEvent[] = created.events.map((e) =>
    e.type === 'hole_cards_dealt' ? { ...e, cards: state.seats.find((s) => s.seat === e.seat)!.holeCards } : e,
  );
  for (const a of actions) {
    const r = applyAction(state, a);
    state = r.state;
    events.push(...r.events);
  }
  return events;
}

const opts = { sessionId: SESSION, playedAt: '2026-11-21T10:00:00.000Z', learningMode: false, heroSeat: 0 };

describe('Hand summary', () => {
  it('summarises a won showdown: net, rake share, VPIP, PFR, position, showdown', () => {
    // Button 0 (hero), SB 1, BB 2. Hero raises, both call, checked down; hero wins.
    const events = rigged(input([20000, 20000, 20000]), ['As Ah', 'Kc Kd', '7c 2d'], '3s 8h 9d Jc 4h', [
      { type: 'raise', seat: 0, to: 600 },
      { type: 'call', seat: 1 },
      { type: 'call', seat: 2 },
      ...(['flop', 'turn', 'river'] as const).flatMap(() => [
        { type: 'check' as const, seat: 1 },
        { type: 'check' as const, seat: 2 },
        { type: 'check' as const, seat: 0 },
      ]),
    ]);
    const s = summarize(events, opts);
    expect(s).toMatchObject({
      id: HAND,
      handNumber: 7,
      heroPosition: 'BTN',
      heroHoleCards: 'AsAh',
      board: '3s8h9dJc4h',
      potTotal: 1800,
      rake: 100, // 10% of 1,800 = 180, rounded down to $1
      heroNet: 1800 - 100 - 600,
      heroRakePaid: 100,
      heroVpip: true,
      heroPfr: true,
      heroSawFlop: true,
      wentToShowdown: true,
      heroWon: true,
      numPlayers: 3,
    });
    expect(handSummarySchema.safeParse({ ...s, events: undefined }).success).toBe(false); // strict: no extra keys
    const { events: ev, ...summary } = s;
    expect(handSummarySchema.parse(summary)).toEqual(summary);
    expect(storedHandSchema.safeParse(s).success).toBe(true);
    expect(ev.length).toBeGreaterThan(5);
  });

  it('hero folding preflop: no VPIP, did not see the flop, pays no rake', () => {
    const events = rigged(input([20000, 20000, 20000], 1), ['7c 2d', 'As Ah', 'Kc Kd'], '3s 8h 9d Jc 4h', [
      // Button 1, SB 2, BB 0 (hero). Button raises, SB calls, hero folds.
      { type: 'raise', seat: 1, to: 600 },
      { type: 'call', seat: 2 },
      { type: 'fold', seat: 0 },
      ...(['flop', 'turn', 'river'] as const).flatMap(() => [
        { type: 'check' as const, seat: 2 },
        { type: 'check' as const, seat: 1 },
      ]),
    ]);
    const s = summarize(events, opts);
    expect(s).toMatchObject({
      heroPosition: 'BB',
      heroVpip: false,
      heroPfr: false,
      heroSawFlop: false,
      wentToShowdown: false,
      heroNet: -200,
      heroRakePaid: 0,
      heroWon: false,
    });
  });

  it('a split pot charges the hero half the rake', () => {
    const events = rigged(input([20000, 20000]), ['2c 3d', '4c 5d'], 'Ah Kh Qh Jh Th', [
      { type: 'raise', seat: 0, to: 1000 },
      { type: 'call', seat: 1 },
      ...(['flop', 'turn', 'river'] as const).flatMap(() => [
        { type: 'check' as const, seat: 1 },
        { type: 'check' as const, seat: 0 },
      ]),
    ]);
    const s = summarize(events, opts);
    expect(s.rake).toBe(200);
    expect(s.heroRakePaid).toBe(100);
    expect(s.heroNet).toBe(-100);
    expect(s.heroNet + s.heroRakePaid).toBe(0); // before rake, a split is break-even
  });

  it('names positions around the table', () => {
    const six = [0, 1, 2, 3, 4, 5];
    expect(six.map((s) => positionOf(s, six, 0))).toEqual(['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO']);
    expect(positionOf(0, [0, 3], 0)).toBe('BTN');
    expect(positionOf(3, [0, 3], 0)).toBe('BB');
    expect(positionOf(4, [0, 2, 4, 6], 6)).toBe('UTG');
    const nine = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    expect(nine.map((s) => positionOf(s, nine, 0))).toEqual(['BTN', 'SB', 'BB', 'UTG', 'MP', 'MP', 'MP', 'MP', 'CO']);
  });
});
