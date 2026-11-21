/** The four bot archetypes and their tuning (PLAN 5.2). */

export type ArchetypeId = 'tag' | 'loosePassive' | 'callingStation' | 'maniac';

export interface BotProfile {
  id: ArchetypeId;
  label: string;
  description: string;
  preflop: {
    openEarly: number; // open-raise when unopened: Chen at least
    openLate: number;
    limp: number | null; // limp when unopened: Chen at least (null = never)
    callRaise: number; // call a raise: Chen at least
    reraise: number; // re-raise: Chen at least
    openSizeBb: number; // open size in big blinds, plus 1 per limper
  };
  postflop: {
    valueBet: number; // bet when equity at least
    betChance: number; // chance to bet (or raise) when over the threshold
    bluff: number; // bluff chance when checked to and under it
    raise: number; // raise a bet when equity at least
    callMargin: number; // call when equity >= pot odds + margin
    sizeWeights: [number, number, number]; // 33%, 66%, 100% of pot
  };
}

export const PROFILES: Record<ArchetypeId, BotProfile> = {
  tag: {
    id: 'tag',
    label: 'Tight-aggressive',
    description: 'Plays few hands and bets them hard.',
    preflop: { openEarly: 9, openLate: 7, limp: null, callRaise: 8, reraise: 12, openSizeBb: 3 },
    postflop: { valueBet: 0.6, betChance: 0.8, bluff: 0.15, raise: 0.8, callMargin: 0.05, sizeWeights: [30, 50, 20] },
  },
  loosePassive: {
    id: 'loosePassive',
    label: 'Loose-passive',
    description: 'Limps and calls a lot, rarely raises.',
    preflop: { openEarly: 12, openLate: 11, limp: 5, callRaise: 6, reraise: 14, openSizeBb: 3 },
    postflop: { valueBet: 0.7, betChance: 0.4, bluff: 0.05, raise: 0.9, callMargin: -0.03, sizeWeights: [30, 50, 20] },
  },
  callingStation: {
    id: 'callingStation',
    label: 'Calling station',
    description: 'Calls almost anything, hates folding.',
    preflop: { openEarly: 13, openLate: 12, limp: 3, callRaise: 4, reraise: 15, openSizeBb: 3 },
    postflop: { valueBet: 0.75, betChance: 0.3, bluff: 0.02, raise: 0.92, callMargin: -0.12, sizeWeights: [30, 50, 20] },
  },
  maniac: {
    id: 'maniac',
    label: 'Maniac',
    description: 'Raises and bluffs relentlessly.',
    preflop: { openEarly: 5, openLate: 4, limp: null, callRaise: 6, reraise: 9, openSizeBb: 4 },
    postflop: { valueBet: 0.5, betChance: 0.9, bluff: 0.4, raise: 0.65, callMargin: 0, sizeWeights: [10, 40, 50] },
  },
};

export const ARCHETYPES: ArchetypeId[] = ['tag', 'loosePassive', 'callingStation', 'maniac'];

export function isArchetypeId(value: unknown): value is ArchetypeId {
  return typeof value === 'string' && (ARCHETYPES as string[]).includes(value);
}

/**
 * A random mix for `count` bots, seeded. Every archetype appears once before
 * any repeats, so a 4+ bot table always has one of each.
 */
export function randomMix(count: number, rng: () => number): ArchetypeId[] {
  const out: ArchetypeId[] = [];
  while (out.length < count) {
    const round = [...ARCHETYPES];
    for (let i = round.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [round[i], round[j]] = [round[j], round[i]];
    }
    out.push(...round);
  }
  return out.slice(0, count);
}
