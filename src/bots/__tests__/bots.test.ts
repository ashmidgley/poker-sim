import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createHand,
  legalActions,
  mulberry32,
  parseCards,
  randInt,
  type Card,
  type HandState,
  type NewHandInput,
} from '@/engine';
import { chenScore } from '../chen';
import { decide } from '../decide';
import { ARCHETYPES, PROFILES, randomMix, type ArchetypeId } from '../profiles';
import { buildBotView } from '../view';

const hole = (s: string) => parseCards(s) as [Card, Card];
const NO_RAKE = { percentBps: 0, cap: 0, roundTo: 1, noFlopNoDrop: true };

function input(players: number, opts: { button?: number; seed?: string } = {}): NewHandInput {
  return {
    handId: 'h',
    handNumber: 1,
    sessionSeed: opts.seed ?? 'bots',
    buttonSeat: opts.button ?? 0,
    config: { smallBlind: 100, bigBlind: 200, rake: NO_RAKE },
    seats: Array.from({ length: players }, (_, seat) => ({
      seat,
      playerId: `p${seat}`,
      name: `P${seat}`,
      isHuman: false,
      stack: 20000,
    })),
  };
}

/** Give the seat to act specific hole cards (keeps the deck consistent enough for tests). */
function withHole(state: HandState, seat: number, cards: string): HandState {
  return { ...state, seats: state.seats.map((s) => (s.seat === seat ? { ...s, holeCards: hole(cards) } : s)) };
}

describe('Chen formula', () => {
  it('matches the reference values', () => {
    expect(chenScore(hole('As Ah'))).toBe(20);
    expect(chenScore(hole('As Ks'))).toBe(12);
    expect(chenScore(hole('As Kd'))).toBe(10);
    expect(chenScore(hole('Js Ts'))).toBe(9);
    expect(chenScore(hole('7s 2d'))).toBe(-1);
    expect(chenScore(hole('2s 2d'))).toBe(5);
  });
});

describe('Bot view', () => {
  it('contains no other seat hole cards and no deck', () => {
    const { state } = createHand(input(6, { seed: 'view' }));
    const view = buildBotView(state);
    const me = state.seats.find((s) => s.seat === view.seat)!;
    expect(view.holeCards).toEqual(me.holeCards);
    const text = JSON.stringify(view);
    for (const s of state.seats) {
      if (s.seat === view.seat) continue;
      for (const c of s.holeCards) expect(text).not.toContain(`"${c}"`);
    }
    for (const c of state.deck) expect(text).not.toContain(`"${c}"`);
    expect(Object.keys(view)).not.toContain('deck');
    for (const seat of view.seats) expect(Object.keys(seat)).not.toContain('holeCards');
  });

  it('recovers the street of every action', () => {
    let { state } = createHand(input(3));
    for (const a of [
      { type: 'call', seat: 0 },
      { type: 'call', seat: 1 },
      { type: 'check', seat: 2 },
      { type: 'check', seat: 1 },
    ] as const)
      state = applyAction(state, a).state;
    const view = buildBotView(state);
    expect(view.history.map((h) => h.street)).toEqual(['preflop', 'preflop', 'preflop', 'flop']);
    expect(view.street).toBe('flop');
  });
});

describe('Bot decisions', () => {
  const rng = () => mulberry32(1);

  it('tight-aggressive folds 72o under the gun', () => {
    // 6 players, button 0: seat 3 is first to act.
    const state = withHole(createHand(input(6)).state, 3, '7s 2d');
    expect(decide(buildBotView(state), PROFILES.tag, rng())).toEqual({ type: 'fold', seat: 3 });
  });

  it('tight-aggressive opens AKo to 3 big blinds', () => {
    const state = withHole(createHand(input(6)).state, 3, 'As Kd');
    expect(decide(buildBotView(state), PROFILES.tag, rng())).toEqual({ type: 'raise', seat: 3, to: 600 });
  });

  it('adds a big blind to the open per limper', () => {
    let state = createHand(input(6)).state;
    state = applyAction(state, { type: 'call', seat: 3 }).state;
    state = withHole(state, 4, 'As Kd');
    expect(decide(buildBotView(state), PROFILES.tag, rng())).toEqual({ type: 'raise', seat: 4, to: 800 });
  });

  it('maniac opens weak hands that tight-aggressive folds', () => {
    // Seat 5 is the seat before the button: late position.
    let state = createHand(input(6)).state;
    for (const seat of [3, 4]) state = applyAction(state, { type: 'fold', seat }).state;
    state = withHole(state, 5, '9s 7d'); // Chen 4
    expect(decide(buildBotView(state), PROFILES.maniac, rng()).type).toBe('raise');
    expect(decide(buildBotView(state), PROFILES.tag, rng()).type).toBe('fold');
  });

  it('calling station calls a raise with a weak hand; tight-aggressive folds it', () => {
    let state = createHand(input(6)).state;
    state = applyAction(state, { type: 'raise', seat: 3, to: 600 }).state;
    state = withHole(state, 4, 'Ts 7s'); // Chen 4
    expect(decide(buildBotView(state), PROFILES.callingStation, rng()).type).toBe('call');
    expect(decide(buildBotView(state), PROFILES.tag, rng()).type).toBe('fold');
  });

  it('goes all-in with aces facing a re-raise after raising', () => {
    let state = createHand(input(6)).state;
    state = applyAction(state, { type: 'raise', seat: 3, to: 600 }).state;
    state = applyAction(state, { type: 'raise', seat: 4, to: 1800 }).state;
    for (const seat of [5, 0, 1, 2]) state = applyAction(state, { type: 'fold', seat }).state;
    state = withHole(state, 3, 'As Ah');
    expect(decide(buildBotView(state), PROFILES.tag, rng())).toEqual({ type: 'raise', seat: 3, to: 20000 });
  });

  it('checks the big blind option rather than folding', () => {
    let state = createHand(input(3)).state;
    state = applyAction(state, { type: 'call', seat: 0 }).state;
    state = applyAction(state, { type: 'call', seat: 1 }).state;
    state = withHole(state, 2, '7s 2d');
    expect(decide(buildBotView(state), PROFILES.tag, rng())).toEqual({ type: 'check', seat: 2 });
  });
});

describe('Bot sanity simulation', () => {
  it('5,000 bot-only hands: legal play, chips conserved, archetypes behave like their names', () => {
    const rng = mulberry32(777);
    const dealt: Record<ArchetypeId, number> = { tag: 0, loosePassive: 0, callingStation: 0, maniac: 0 };
    const vpip: Record<ArchetypeId, number> = { tag: 0, loosePassive: 0, callingStation: 0, maniac: 0 };
    const pfr: Record<ArchetypeId, number> = { tag: 0, loosePassive: 0, callingStation: 0, maniac: 0 };
    let slowest = 0;

    for (let h = 0; h < 5000; h++) {
      const players = 4 + randInt(rng, 6);
      const profiles = randomMix(players, rng);
      const hi = { ...input(players, { button: randInt(rng, players), seed: `sim-${h}` }), handNumber: h + 1 };
      let state = createHand(hi).state;
      const volunteered = new Set<number>();
      const raised = new Set<number>();
      let steps = 0;

      while (state.phase !== 'complete') {
        const legal = legalActions(state)!;
        const t0 = performance.now();
        const action = decide(buildBotView(state), PROFILES[profiles[legal.seat]], rng);
        slowest = Math.max(slowest, performance.now() - t0);
        if (state.phase === 'preflop' && action.type !== 'fold' && action.type !== 'check') volunteered.add(legal.seat);
        if (state.phase === 'preflop' && (action.type === 'raise' || action.type === 'bet')) raised.add(legal.seat);
        state = applyAction(state, action).state; // throws on any illegal action
        expect(++steps).toBeLessThan(500);
      }

      const total = state.seats.reduce((a, s) => a + s.stack, 0) + state.rake;
      expect(total).toBe(players * 20000);
      for (const s of state.seats) {
        dealt[profiles[s.seat]]++;
        if (volunteered.has(s.seat)) vpip[profiles[s.seat]]++;
        if (raised.has(s.seat)) pfr[profiles[s.seat]]++;
      }
    }

    const rate = (m: Record<ArchetypeId, number>) =>
      Object.fromEntries(ARCHETYPES.map((a) => [a, m[a] / dealt[a]])) as Record<ArchetypeId, number>;
    const v = rate(vpip);
    const p = rate(pfr);
    console.log('VPIP', v, '\nPFR', p, `\nslowest decision ${slowest.toFixed(1)} ms`);

    expect(v.tag).toBeLessThan(v.loosePassive);
    expect(v.loosePassive).toBeLessThan(v.callingStation);
    for (const a of ARCHETYPES) if (a !== 'maniac') expect(p.maniac).toBeGreaterThan(p[a]);
  }, 120_000);
});
