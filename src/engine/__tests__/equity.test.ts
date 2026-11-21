import { describe, expect, it } from 'vitest';
import { parseCards, type Card } from '../cards';
import { equityKnown, equityVsRandom } from '../equity';
import { nextCardOuts } from '../outs';
import { buildPots, splitPot } from '../pots';
import { computeRake, deductRake } from '../rake';
import { mulberry32 } from '../rng';
import { botRebuys, initialButton, nextButton } from '../table';
import type { SeatState } from '../types';

const hand = (s: string) => parseCards(s) as [Card, Card];

describe('Equity', () => {
  it('AA vs KK preflop is about 81 to 82%', () => {
    const [aa, kk] = equityKnown([hand('As Ah'), hand('Kd Kc')], [], mulberry32(1));
    expect(Math.abs(aa.equity - 0.8175)).toBeLessThanOrEqual(0.015);
    expect(aa.equity + kk.equity).toBeCloseTo(1, 10);
  });

  it('a made flush against a hand drawing dead on the turn is exactly 100%', () => {
    const [flush, dead] = equityKnown([hand('Ah 2c'), hand('Kc Qd')], parseCards('3h 7h 9h Jh'), mulberry32(1));
    expect(flush).toEqual({ win: 1, tie: 0, equity: 1 });
    expect(dead.equity).toBe(0);
  });

  it('equities sum to 1 three-way on the flop (exact enumeration)', () => {
    const res = equityKnown([hand('Ah 5h'), hand('Kc Kd'), hand('Qs Js')], parseCards('2h 7h Tc'), mulberry32(1));
    expect(res.reduce((a, r) => a + r.equity, 0)).toBeCloseTo(1, 10);
  });

  it('counts ties when both players play the board', () => {
    const res = equityKnown([hand('2c 3d'), hand('4c 5d')], parseCards('Ah Kh Qh Jh Th'), mulberry32(1));
    expect(res).toEqual([
      { win: 0, tie: 1, equity: 0.5 },
      { win: 0, tie: 1, equity: 0.5 },
    ]);
  });

  it('AA against one random hand is about 85%', () => {
    const r = equityVsRandom(hand('As Ah'), [], 1, 5000, mulberry32(7));
    expect(Math.abs(r.equity - 0.852)).toBeLessThan(0.02);
  });

  it('is reproducible from the same seed', () => {
    const a = equityVsRandom(hand('Ts 9s'), [], 3, 2000, mulberry32(3));
    const b = equityVsRandom(hand('Ts 9s'), [], 3, 2000, mulberry32(3));
    expect(a).toEqual(b);
  });

  it('runs a 9-way preflop known-hands calculation in reasonable time', () => {
    const hands = ['As Ah', 'Kd Kc', 'Qs Qh', 'Jd Jc', 'Ts 9s', '8d 7d', '6c 5c', '4h 3h', '2s 2d'].map(hand);
    const t0 = performance.now();
    const res = equityKnown(hands, [], mulberry32(5));
    const ms = performance.now() - t0;
    expect(res.reduce((a, r) => a + r.equity, 0)).toBeCloseTo(1, 6);
    // PLAN 4.8: optimise only if this exceeds ~200 ms. Logged for the record.
    console.log(`9-way preflop equityKnown (20,000 runouts): ${ms.toFixed(0)} ms`);
  });
});

describe('Outs', () => {
  it('a nut flush draw with an overcard has 12 outs against an overpair', () => {
    const [res] = nextCardOuts([hand('Ah 5h'), hand('Kc Kd')], parseCards('2h 7h Jc'));
    expect(res.seatIndex).toBe(0);
    // Nine hearts make the flush; the three other aces make a pair of aces over kings.
    expect(res.outs).toHaveLength(12);
    expect(res.outs.filter((c) => c[1] === 'h')).toHaveLength(9);
    expect(res.outs.filter((c) => c[0] === 'A').sort()).toEqual(['Ac', 'Ad', 'As']);
  });

  it('the leader has no outs listed', () => {
    const res = nextCardOuts([hand('Ah 5h'), hand('Kc Kd')], parseCards('2h 7h Jc'));
    expect(res.map((r) => r.seatIndex)).toEqual([0]);
  });
});

describe('Pots, rake and table helpers', () => {
  const seat = (n: number, committedHand: number, status: SeatState['status']): SeatState =>
    ({ seat: n, committedHand, status }) as SeatState;

  it('includes folded chips in pots but never makes folded seats eligible', () => {
    const pots = buildPots([seat(0, 500, 'folded'), seat(1, 300, 'allIn'), seat(2, 1000, 'active'), seat(3, 1000, 'active')]);
    expect(pots).toEqual([
      { amount: 1200, eligible: [1, 2, 3] },
      { amount: 1600, eligible: [2, 3] }, // 200 folded excess + 700 + 700
    ]);
  });

  it('splits odd chips clockwise from the button', () => {
    expect(splitPot(10, [1, 4, 7], 5)).toEqual([
      { seat: 7, amount: 4 },
      { seat: 1, amount: 3 },
      { seat: 4, amount: 3 },
    ]);
  });

  it('computes rake with cap, rounding and no flop, no drop', () => {
    const live = { percentBps: 1000, cap: 600, roundTo: 100, noFlopNoDrop: true };
    expect(computeRake(100000, live, true)).toBe(600);
    expect(computeRake(2550, live, true)).toBe(200);
    expect(computeRake(100000, live, false)).toBe(0);
    expect(computeRake(1000, { ...live, noFlopNoDrop: false }, false)).toBe(100);
  });

  it('deducts rake from the main pot first', () => {
    const pots = [
      { amount: 100, eligible: [0, 1, 2] },
      { amount: 500, eligible: [1, 2] },
    ];
    expect(deductRake(pots, 150)).toEqual([100, 50]);
    expect(pots.map((p) => p.amount)).toEqual([0, 450]);
  });

  it('moves the button clockwise to the next seat dealt in', () => {
    expect(nextButton(2, [0, 2, 5, 7])).toBe(5);
    expect(nextButton(7, [0, 2, 5, 7])).toBe(0);
    expect(nextButton(3, [0, 2, 5, 7])).toBe(5); // previous button busted
    expect(initialButton('seed', [0, 1, 2, 3])).toBe(initialButton('seed', [0, 1, 2, 3]));
  });

  it('rebuys busted bots to 100 big blinds but never the human', () => {
    expect(
      botRebuys(
        [
          { seat: 0, isHuman: true, stack: 0 },
          { seat: 1, isHuman: false, stack: 0 },
          { seat: 2, isHuman: false, stack: 500 },
        ],
        200,
      ),
    ).toEqual([{ seat: 1, amount: 20000 }]);
  });
});
