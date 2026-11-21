import { describe, expect, it } from 'vitest';
import { createHand, applyAction } from '../hand';
import { legalActions, IllegalActionError } from '../legal';
import { replay } from '../replay';
import { mulberry32, randInt, type Rng } from '../rng';
import type { Action, HandEvent, HandState, RakeConfig } from '../types';
import { eventsOf, makeInput, NO_RAKE, play, riggedHand, stackOf } from './helpers';

const BB = 200;

function randomAction(state: HandState, rng: Rng): Action {
  const legal = legalActions(state)!;
  const seat = legal.seat;
  const roll = rng();
  if (legal.raise && roll < 0.25) {
    const { minTo, maxTo, kind } = legal.raise;
    const pick = rng();
    const to = pick < 0.4 ? minTo : pick < 0.6 ? maxTo : minTo + randInt(rng, maxTo - minTo + 1);
    return { type: kind, seat, to };
  }
  if (roll < 0.4 && !legal.canCheck) return { type: 'fold', seat };
  if (roll < 0.45) return { type: 'fold', seat };
  return legal.canCheck ? { type: 'check', seat } : { type: 'call', seat };
}

function contributed(events: HandEvent[]): number {
  let total = 0;
  for (const e of events) {
    if (e.type === 'blind_posted') total += e.amount;
    if (e.type === 'action') total += e.added;
    if (e.type === 'uncalled_returned') total -= e.amount;
  }
  return total;
}

describe('Chip conservation (property)', () => {
  it('holds over 2,000 seeded random hands', () => {
    const rng = mulberry32(2024);
    const rakes: RakeConfig[] = [
      NO_RAKE,
      { percentBps: 1000, cap: 600, roundTo: 100, noFlopNoDrop: true },
      { percentBps: 500, cap: 300, roundTo: 1, noFlopNoDrop: false },
      { percentBps: 1000, cap: 0, roundTo: 1, noFlopNoDrop: true },
    ];
    for (let h = 0; h < 2000; h++) {
      const players = 2 + randInt(rng, 8);
      const stacks = Array.from({ length: players }, () => BB + randInt(rng, 300 * BB - BB + 1));
      const input = makeInput(stacks, {
        button: randInt(rng, players),
        rake: rakes[randInt(rng, rakes.length)],
        seed: `prop-${h}`,
      });
      const created = createHand(input);
      let state = created.state;
      const events = created.events;
      const all = [...events];
      let steps = 0;
      while (state.phase !== 'complete') {
        const r = applyAction(state, randomAction(state, rng));
        state = r.state;
        all.push(...r.events);
        steps++;
        expect(steps).toBeLessThan(500);
      }
      const start = stacks.reduce((a, b) => a + b, 0);
      const end = state.seats.reduce((a, s) => a + s.stack, 0);
      expect(end + state.rake).toBe(start);
      for (const s of state.seats) expect(s.stack).toBeGreaterThanOrEqual(0);

      const awards = eventsOf(all, 'pot_awarded');
      const awarded = awards.reduce((a, p) => a + p.amount, 0);
      expect(awarded + state.rake).toBe(contributed(all));
      for (const p of awards) expect(p.winners.reduce((a, w) => a + w.amount, 0)).toBe(p.amount);
      expect(all.at(-1)!.type).toBe('hand_completed');
    }
  });
});

describe('Three all-ins of different sizes', () => {
  it('builds three pots with the right amounts and winners', () => {
    const input = makeInput([50 * BB, 150 * BB, 400 * BB, 400 * BB]);
    // Button 0, SB 1, BB 2, UTG 3. Seat 0 best, then 1, then 2, seat 3 worst.
    const start = riggedHand(input, ['Ac Ad', 'Kc Kd', 'Qc Qd', '8d 4c'], '2c 5d 9h Js 3s');
    const { state, events } = play(start, [
      { type: 'raise', seat: 3, to: 400 * BB },
      { type: 'call', seat: 0 },
      { type: 'call', seat: 1 },
      { type: 'call', seat: 2 },
    ]);
    const awards = eventsOf(events, 'pot_awarded');
    expect(awards).toHaveLength(3);
    expect(awards.map((a) => a.amount)).toEqual([40000, 60000, 100000]);
    expect(awards.map((a) => a.winners)).toEqual([
      [{ seat: 0, amount: 40000 }],
      [{ seat: 1, amount: 60000 }],
      [{ seat: 2, amount: 100000 }],
    ]);
    expect([0, 1, 2, 3].map((s) => stackOf(state, s))).toEqual([40000, 60000, 100000, 0]);
    expect(eventsOf(events, 'all_in_runout')).toHaveLength(1);
    expect(state.board).toHaveLength(5);
  });
});

describe('Split pot with an odd chip', () => {
  it('gives the extra cent to the first tied seat left of the button', () => {
    const input = makeInput([1000, 1000, 1000], { sb: 5, bb: 10 });
    // Both remaining players play a royal flush on the board.
    const start = riggedHand(input, ['2c 3d', '4c 5d', '6c 7d'], 'Ah Kh Qh Jh Th');
    const { state, events } = play(start, [
      { type: 'call', seat: 0 },
      { type: 'fold', seat: 1 },
      { type: 'check', seat: 2 },
      { type: 'check', seat: 2 },
      { type: 'check', seat: 0 },
      { type: 'check', seat: 2 },
      { type: 'check', seat: 0 },
      { type: 'check', seat: 2 },
      { type: 'check', seat: 0 },
    ]);
    const [award] = eventsOf(events, 'pot_awarded');
    expect(award.amount).toBe(25);
    expect(award.winners).toEqual([
      { seat: 2, amount: 13 },
      { seat: 0, amount: 12 },
    ]);
    expect(stackOf(state, 2)).toBe(1003);
    expect(stackOf(state, 0)).toBe(1002);
  });
});

describe('Heads-up blinds', () => {
  it('button posts the small blind and acts first preflop; big blind acts first on the flop', () => {
    const { state, events } = createHand(makeInput([10000, 10000], { button: 1 }));
    const blinds = eventsOf(events, 'blind_posted');
    expect(blinds).toEqual([
      { type: 'blind_posted', seat: 1, kind: 'sb', amount: 100, allIn: false },
      { type: 'blind_posted', seat: 0, kind: 'bb', amount: 200, allIn: false },
    ]);
    expect(state.toAct).toBe(1);
    const after = play({ state, events: [] }, [
      { type: 'call', seat: 1 },
      { type: 'check', seat: 0 },
    ]);
    expect(after.state.phase).toBe('flop');
    expect(after.state.toAct).toBe(0);
  });
});

describe('Min-raise enforcement', () => {
  it('rejects a raise below the minimum and accepts the minimum', () => {
    const { state } = createHand(makeInput([10000, 10000, 10000]));
    expect(state.toAct).toBe(0);
    expect(legalActions(state)!.raise).toEqual({ kind: 'raise', minTo: 400, maxTo: 10000 });
    expect(() => applyAction(state, { type: 'raise', seat: 0, to: 300 })).toThrow(IllegalActionError);
    expect(() => applyAction(state, { type: 'bet', seat: 0, to: 400 })).toThrow(IllegalActionError);
    const r = applyAction(state, { type: 'raise', seat: 0, to: 400 });
    expect(r.state.currentBet).toBe(400);
    expect(legalActions(r.state)!.raise!.minTo).toBe(600);
  });

  it('accepts an all-in below the minimum, which does not reopen raising', () => {
    // Button 0 and SB 1 deep; BB 2 has 700 total.
    const start = createHand(makeInput([10000, 10000, 700]));
    const mid = play(start, [
      { type: 'raise', seat: 0, to: 600 },
      { type: 'call', seat: 1 },
    ]);
    const bbLegal = legalActions(mid.state)!;
    expect(bbLegal.raise).toEqual({ kind: 'raise', minTo: 700, maxTo: 700 });
    const after = applyAction(mid.state, { type: 'raise', seat: 2, to: 700 });
    expect(after.state.currentBet).toBe(700);

    const seat0 = legalActions(after.state)!;
    expect(seat0.seat).toBe(0);
    expect(seat0.raise).toBeNull();
    expect(seat0.callAmount).toBe(100);
    expect(seat0.canFold).toBe(true);
    expect(() => applyAction(after.state, { type: 'raise', seat: 0, to: 1100 })).toThrow(IllegalActionError);

    const seat1 = applyAction(after.state, { type: 'call', seat: 0 }).state;
    expect(legalActions(seat1)!.raise).toBeNull();
    expect(legalActions(seat1)!.callAmount).toBe(100);
  });

  it('a seat that has not acted can still raise over an incomplete all-in', () => {
    // Seat 3 (UTG) raises, seat 0 short all-in for less than a full raise, SB 1 can still re-raise.
    const start = createHand(makeInput([700, 10000, 10000, 10000]));
    const s = play(start, [
      { type: 'raise', seat: 3, to: 600 },
      { type: 'raise', seat: 0, to: 700 },
    ]);
    expect(legalActions(s.state)!.seat).toBe(1);
    expect(legalActions(s.state)!.raise).toEqual({ kind: 'raise', minTo: 1100, maxTo: 10000 });
  });
});

describe('Big blind option', () => {
  it('lets the big blind check or raise when limped to', () => {
    const start = createHand(makeInput([10000, 10000, 10000]));
    const s = play(start, [
      { type: 'call', seat: 0 },
      { type: 'call', seat: 1 },
    ]);
    const legal = legalActions(s.state)!;
    expect(legal.seat).toBe(2);
    expect(legal.canCheck).toBe(true);
    expect(legal.raise).not.toBeNull();
    const after = applyAction(s.state, { type: 'check', seat: 2 });
    expect(after.state.phase).toBe('flop');
  });
});

describe('Uncalled bet', () => {
  it('returns a bet nobody calls and does not rake it', () => {
    const rake: RakeConfig = { percentBps: 1000, cap: 0, roundTo: 1, noFlopNoDrop: true };
    const start = createHand(makeInput([10000, 10000, 10000], { rake }));
    const { state, events } = play(start, [
      { type: 'call', seat: 0 },
      { type: 'call', seat: 1 },
      { type: 'check', seat: 2 },
      // Flop: SB (1) acts first.
      { type: 'bet', seat: 1, to: 1000 },
      { type: 'fold', seat: 2 },
      { type: 'fold', seat: 0 },
    ]);
    expect(eventsOf(events, 'uncalled_returned')).toEqual([{ type: 'uncalled_returned', seat: 1, amount: 1000 }]);
    expect(state.rake).toBe(60); // 10% of the 600 pot, not of 1,600
    expect(stackOf(state, 1)).toBe(10000 - 200 + 600 - 60);
    expect(eventsOf(events, 'showdown')).toHaveLength(0);
    expect(eventsOf(events, 'pot_awarded')[0].description).toBeNull();
  });
});

describe('Rake cap and no flop, no drop', () => {
  const live: RakeConfig = { percentBps: 1000, cap: 600, roundTo: 100, noFlopNoDrop: true };

  it('hits the cap on a large pot and is taken from the main pot first', () => {
    const input = makeInput([50 * BB, 150 * BB, 400 * BB, 400 * BB], { rake: live });
    const start = riggedHand(input, ['Ac Ad', 'Kc Kd', 'Qc Qd', '8d 4c'], '2c 5d 9h Js 3s');
    const { state, events } = play(start, [
      { type: 'raise', seat: 3, to: 400 * BB },
      { type: 'call', seat: 0 },
      { type: 'call', seat: 1 },
      { type: 'call', seat: 2 },
    ]);
    expect(state.rake).toBe(600);
    expect(eventsOf(events, 'rake_taken')).toEqual([{ type: 'rake_taken', amount: 600, fromPots: [600, 0, 0] }]);
    expect(eventsOf(events, 'pot_awarded')[0].amount).toBe(40000 - 600);
  });

  it('rounds down to roundTo', () => {
    // Limped pot of 600 to the flop, checked down: 10% = 60, rounds down to 0 at $1 steps.
    const start = createHand(makeInput([10000, 10000, 10000], { rake: live }));
    const checks: Action[] = [
      { type: 'call', seat: 0 },
      { type: 'call', seat: 1 },
      { type: 'check', seat: 2 },
    ];
    for (let i = 0; i < 3; i++) checks.push({ type: 'check', seat: 1 }, { type: 'check', seat: 2 }, { type: 'check', seat: 0 });
    expect(play(start, checks).state.rake).toBe(0);

    // A 2,700 pot: 10% = 270, rounds down to 200.
    const start2 = createHand(makeInput([10000, 10000, 10000], { rake: live }));
    const raised: Action[] = [
      { type: 'raise', seat: 0, to: 800 },
      { type: 'call', seat: 1 },
      { type: 'fold', seat: 2 },
      // flop: 1700 pot
      { type: 'bet', seat: 1, to: 450 },
      { type: 'call', seat: 0 },
    ];
    for (let i = 0; i < 2; i++) raised.push({ type: 'check', seat: 1 }, { type: 'check', seat: 0 });
    const r = play(start2, raised);
    expect(r.state.rake).toBe(200);
  });

  it('is 0 when the hand ends preflop with no flop, no drop', () => {
    const start = createHand(makeInput([10000, 10000, 10000], { rake: { ...live, roundTo: 1 } }));
    const { state, events } = play(start, [
      { type: 'raise', seat: 0, to: 1000 },
      { type: 'fold', seat: 1 },
      { type: 'fold', seat: 2 },
    ]);
    expect(state.rake).toBe(0);
    expect(eventsOf(events, 'rake_taken')).toHaveLength(0);
  });

  it('is charged preflop when no flop, no drop is off', () => {
    const start = createHand(
      makeInput([10000, 10000, 10000], { rake: { percentBps: 1000, cap: 600, roundTo: 1, noFlopNoDrop: false } }),
    );
    const { state } = play(start, [
      { type: 'raise', seat: 0, to: 1000 },
      { type: 'fold', seat: 1 },
      { type: 'fold', seat: 2 },
    ]);
    // Pot after the uncalled 800 is returned: 200 + 100 + 200 = 500; 10% = 50.
    expect(state.rake).toBe(50);
  });
});

describe('Deterministic replay', () => {
  it('replays to an identical event log, and the same seed gives the same deck', () => {
    const rng = mulberry32(99);
    for (let h = 0; h < 50; h++) {
      const input = makeInput([20000, 15000, 30000, 8000, 50000], { seed: `replay-${h}`, button: h % 5 });
      const created = createHand(input);
      let state = created.state;
      const events = created.events;
      const all = [...events];
      while (state.phase !== 'complete') {
        const r = applyAction(state, randomAction(state, rng));
        state = r.state;
        all.push(...r.events);
      }
      const again = replay(input, state.actions);
      expect(again.events).toEqual(all);
      expect(again.state).toEqual(state);
    }
    const a = createHand(makeInput([1000, 1000], { seed: 'same' })).state;
    const b = createHand(makeInput([1000, 1000], { seed: 'same' })).state;
    expect(a.seats.map((s) => s.holeCards)).toEqual(b.seats.map((s) => s.holeCards));
    expect(a.deck).toEqual(b.deck);
    const c = createHand(makeInput([1000, 1000], { seed: 'different' })).state;
    expect(c.deck).not.toEqual(a.deck);
  });
});

describe('Short blinds and all-in edge cases', () => {
  it('a big blind that cannot cover posts all-in; currentBet is still the full big blind', () => {
    const { state, events } = createHand(makeInput([10000, 10000, 150]));
    expect(eventsOf(events, 'blind_posted')[1]).toEqual({ type: 'blind_posted', seat: 2, kind: 'bb', amount: 150, allIn: true });
    expect(state.currentBet).toBe(200);
    expect(legalActions(state)!.callAmount).toBe(200);
  });

  it('returns a folded small blind excess over a short all-in big blind', () => {
    // Button 2, SB 0 posts 100, BB 1 is all-in for 50.
    const { state, events } = play(createHand(makeInput([10000, 50, 10000], { button: 2 })), [
      { type: 'fold', seat: 2 },
      { type: 'fold', seat: 0 },
    ]);
    expect(eventsOf(events, 'uncalled_returned')).toEqual([{ type: 'uncalled_returned', seat: 0, amount: 50 }]);
    expect([0, 1, 2].map((s) => stackOf(state, s))).toEqual([9950, 100, 10000]);
  });

  it('runs the board out when everyone is all-in from the blinds', () => {
    const { state, events } = createHand(makeInput([100, 200], { button: 0 }));
    expect(state.phase).toBe('complete');
    expect(eventsOf(events, 'all_in_runout')).toHaveLength(1);
    expect(state.board).toHaveLength(5);
    expect(state.seats.reduce((a, s) => a + s.stack, 0)).toBe(300);
  });

  it('a lone active seat facing only all-ins may call or fold but not raise', () => {
    const start = createHand(makeInput([10000, 10000, 10000, 3000]));
    const s = play(start, [
      { type: 'raise', seat: 3, to: 3000 },
      { type: 'fold', seat: 0 },
      { type: 'fold', seat: 1 },
    ]);
    const legal = legalActions(s.state)!;
    expect(legal.seat).toBe(2);
    expect(legal.raise).toBeNull();
    expect(legal.callAmount).toBe(2800);
  });
});
