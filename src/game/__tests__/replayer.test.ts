import { describe, expect, it } from 'vitest';
import { buildBotView, decide, PROFILES } from '@/bots';
import { applyAction, createHand, mulberry32, type HandEvent } from '@/engine';
import { buildReplay } from '../replayer';

function playedHand(seed: string): HandEvent[] {
  const rng = mulberry32(42);
  const created = createHand({
    handId: 'h1',
    handNumber: 3,
    sessionSeed: seed,
    buttonSeat: 2,
    config: { smallBlind: 100, bigBlind: 200, rake: { percentBps: 1000, cap: 600, roundTo: 100, noFlopNoDrop: true } },
    seats: [0, 1, 2, 3].map((seat) => ({ seat, playerId: `p${seat}`, name: `P${seat}`, isHuman: seat === 0, stack: 20000 })),
  });
  let state = created.state;
  const events = [...created.events];
  while (state.phase !== 'complete') {
    const r = applyAction(state, decide(buildBotView(state), PROFILES.maniac, rng));
    state = r.state;
    events.push(...r.events);
  }
  return events;
}

describe('Hand replayer', () => {
  it('rebuilds a stored hand step by step and matches the record', () => {
    for (const seed of ['r1', 'r2', 'r3', 'r4', 'r5']) {
      const events = playedHand(seed);
      const replay = buildReplay(events);
      expect(replay.matchesRecord).toBe(true);
      expect(replay.steps).toHaveLength(replay.actions.length + 1);
      expect(replay.steps[0].state.phase).toBe('preflop');
      expect(replay.steps.at(-1)!.state.phase).toBe('complete');
      expect(replay.heroSeat).toBe(0);
    }
  });

  it('flags a record the engine does not reproduce', () => {
    const events = playedHand('r1').map((e) => (e.type === 'rake_taken' ? { ...e, amount: e.amount + 1 } : e));
    const tampered = events.some((e) => e.type === 'rake_taken') ? events : [...events, { type: 'rake_taken', amount: 1, fromPots: [1] } as HandEvent];
    expect(buildReplay(tampered).matchesRecord).toBe(false);
  });
});
