import { describe, expect, it } from 'vitest';
import { legalActions, mulberry32, type Action } from '@/engine';
import { RAKE_PRESETS } from '@/bankroll/presets';
import { buildBotView, decide, PROFILES } from '@/bots';
import type { SessionConfig } from '../session';
import { livePots } from '../tableView';
import {
  heroNeedsRebuy,
  initialTableState,
  isHandInProgress,
  restoreTableState,
  tableReducer,
  toLiveState,
  type TableState,
} from '../tableReducer';

const config = (opponents: number, rakeOn = false): SessionConfig => ({
  id: 's1',
  seed: 'table-test',
  createdAt: '2026-01-01T00:00:00Z',
  opponents,
  smallBlind: 100,
  bigBlind: 200,
  buyIn: 20000,
  botProfiles: (['tag', 'loosePassive', 'callingStation', 'maniac', 'tag', 'loosePassive', 'callingStation', 'maniac'] as const).slice(0, opponents),
  rake: rakeOn ? RAKE_PRESETS.live.rake : RAKE_PRESETS.none.rake,
  learningMode: false,
});

const chips = (s: TableState) => s.players.reduce((a, p) => a + p.stack, 0);

/** Play out the current hand with every seat (hero as tight-aggressive) using the real bots, or the hero shoving. */
function playOut(state: TableState, rng: () => number, heroShoves = false): TableState {
  let s = state;
  while (isHandInProgress(s)) {
    const legal = legalActions(s.hand!)!;
    const profile = s.players.find((p) => p.seat === legal.seat)!.profile ?? 'tag';
    let action: Action = decide(buildBotView(s.hand!), PROFILES[profile], rng);
    if (heroShoves && legal.seat === 0 && legal.raise) action = { type: legal.raise.kind, seat: 0, to: legal.raise.maxTo };
    s = tableReducer(s, { type: 'act', action });
    expect(s.error).toBeNull();
  }
  return s;
}

describe('Table session reducer', () => {
  it('conserves chips across hands apart from rake and bot rebuys, and moves the button', () => {
    for (const opponents of [1, 3, 8]) {
      const rng = mulberry32(opponents);
      let s = initialTableState(config(opponents, true));
      const buttons: number[] = [];
      for (let h = 0; h < 40; h++) {
        if (heroNeedsRebuy(s)) s = tableReducer(s, { type: 'rebuy', amount: 20000 });
        const before = chips(s);
        const bustedBots = s.players.filter((p) => !p.isHuman && p.stack === 0).length;
        s = tableReducer(s, { type: 'startHand', handId: `h${h}` });
        // Bots with no chips are rebought to 100 big blinds before the deal.
        expect(chips(s)).toBe(before + bustedBots * 20000);
        buttons.push(s.hand!.input.buttonSeat);
        const dealtIn = chips(s);
        s = playOut(s, rng, h % 7 === 0);
        // Final stacks copied back to the players: only the rake leaves the table.
        expect(chips(s) + s.hand!.rake).toBe(dealtIn);
        for (const p of s.players) expect(p.stack).toBeGreaterThanOrEqual(0);
      }
      // The button moves every hand.
      for (let i = 1; i < buttons.length; i++) expect(buttons[i]).not.toBe(buttons[i - 1]);
    }
  });

  it('heads-up: the button posts the small blind', () => {
    const s = tableReducer(initialTableState(config(1)), { type: 'startHand', handId: 'x' });
    const blinds = s.events.filter((e) => e.type === 'blind_posted');
    expect(blinds[0]).toMatchObject({ kind: 'sb', seat: s.hand!.input.buttonSeat });
  });

  it('blocks a new hand while the human is busted, until they rebuy', () => {
    let s = initialTableState(config(2));
    s = { ...s, players: s.players.map((p) => (p.isHuman ? { ...p, stack: 0 } : p)) };
    expect(heroNeedsRebuy(s)).toBe(true);
    expect(tableReducer(s, { type: 'startHand', handId: 'x' })).toBe(s);
    s = tableReducer(s, { type: 'rebuy', amount: 8000 });
    expect(s.players[0].stack).toBe(8000);
    expect(tableReducer(s, { type: 'startHand', handId: 'x' }).hand).not.toBeNull();
  });

  it('caps a top-up at 200 big blinds and reports illegal actions without throwing', () => {
    let s = initialTableState(config(2));
    s = tableReducer(s, { type: 'rebuy', amount: 1_000_000 });
    expect(s.players[0].stack).toBe(40000);
    s = tableReducer(s, { type: 'startHand', handId: 'x' });
    const wrongSeat = s.hand!.toAct === 0 ? 1 : 0;
    const after = tableReducer(s, { type: 'act', action: { type: 'fold', seat: wrongSeat } });
    expect(after.error).toMatch(/turn/);
    expect(after.hand).toBe(s.hand);
  });
});

describe('Live pots during a hand', () => {
  const seat = (n: number, committedHand: number, status: 'active' | 'folded' | 'allIn') =>
    ({ seat: n, committedHand, status }) as import('@/engine').SeatState;

  it('shows one pot when nobody is all-in, even with unmatched bets', () => {
    expect(livePots([seat(0, 100, 'active'), seat(1, 200, 'active'), seat(2, 200, 'active'), seat(3, 200, 'active')])).toEqual([
      { amount: 700, eligible: [0, 1, 2, 3] },
    ]);
  });

  it('splits at an all-in amount', () => {
    const pots = livePots([seat(0, 300, 'allIn'), seat(1, 1000, 'active'), seat(2, 800, 'active'), seat(3, 200, 'folded')]);
    expect(pots).toEqual([
      { amount: 1100, eligible: [0, 1, 2] }, // 300 + 300 + 300 + 200 folded
      { amount: 1200, eligible: [1, 2] }, // open pot: 700 + 500 so far; seat 2 can still call
    ]);
  });
});

describe('Resume after a refresh', () => {
  it('restores stacks, button and hand number between hands', () => {
    let s = initialTableState(config(3));
    s = tableReducer(s, { type: 'startHand', handId: 'a' });
    s = playOut(s, mulberry32(5));
    const live = toLiveState(s);
    expect(live.inProgress).toBe(false);
    const restored = restoreTableState(config(3), live);
    expect(restored.players.map((p) => p.stack)).toEqual(s.players.map((p) => p.stack));
    expect(restored.button).toBe(s.button);
    expect(restored.handNumber).toBe(1);
    expect(restored.hand).toBeNull();
  });

  it('voids a hand in progress: pre-hand stacks, and the next deal is a new hand number with new cards', () => {
    let s = initialTableState(config(3));
    s = tableReducer(s, { type: 'startHand', handId: 'a' });
    const firstHole = s.hand!.seats[0].holeCards;
    const live = toLiveState(s); // refresh happens now, blinds already posted
    expect(live.inProgress).toBe(true);
    expect(Object.values(live.stacks)).toEqual([20000, 20000, 20000, 20000]);

    let r = restoreTableState(config(3), live);
    expect(r.players.map((p) => p.stack)).toEqual([20000, 20000, 20000, 20000]);
    r = tableReducer(r, { type: 'startHand', handId: 'b' });
    expect(r.hand!.input.handNumber).toBe(2);
    expect(r.hand!.seats[0].holeCards).not.toEqual(firstHole);
  });
});
