import { rankOf, suitOf, type Card } from './cards';

/**
 * Hand scores are comparable integers:
 *   category << 20 | r1 << 16 | r2 << 12 | r3 << 8 | r4 << 4 | r5
 * with ranks 2..14 ordered by significance for the category.
 *
 * This is a direct evaluator: it scores 5, 6 or 7 cards in one pass and
 * gives the same result as taking the best 5-card subset (verified in tests).
 * Flush is checked first; with at most 7 cards a flush can never coexist with
 * quads or a full house, so that ordering is safe.
 */
export const HandCategory = {
  HighCard: 0,
  Pair: 1,
  TwoPair: 2,
  Trips: 3,
  Straight: 4,
  Flush: 5,
  FullHouse: 6,
  Quads: 7,
  StraightFlush: 8,
} as const;
export type HandCategory = (typeof HandCategory)[keyof typeof HandCategory];

/** Card index 0..51 = (rank - 2) * 4 + suit; matches the fixed deck order. */
export function cardIndex(card: Card): number {
  return (rankOf(card) - 2) * 4 + suitOf(card);
}

function score(category: number, ranks: number[]): number {
  let s = category << 20;
  for (let i = 0; i < 5; i++) s |= (ranks[i] ?? 0) << (16 - 4 * i);
  return s;
}

/** Highest straight in a rank bitmask (bit r set for rank r), or 0. */
function straightHigh(mask: number): number {
  let m = mask;
  if (m & (1 << 14)) m |= 1 << 1; // ace plays low
  for (let high = 14; high >= 5; high--) {
    if (((m >> (high - 4)) & 0x1f) === 0x1f) return high;
  }
  return 0;
}

function topRanksFromMask(mask: number, n: number): number[] {
  const out: number[] = [];
  for (let r = 14; r >= 2 && out.length < n; r--) if (mask & (1 << r)) out.push(r);
  return out;
}

// Scratch buffers reused across calls (the evaluator is synchronous).
const rankCount = new Int8Array(15);
const suitCount = new Int8Array(4);
const suitMask = new Int32Array(4);

/** Evaluate 5 to 7 cards given as card indices (0..51). */
export function evaluateIndices(cards: ArrayLike<number>, length = cards.length): number {
  rankCount.fill(0);
  suitCount.fill(0);
  suitMask.fill(0);
  let rankMask = 0;
  for (let i = 0; i < length; i++) {
    const c = cards[i];
    const r = (c >> 2) + 2;
    const s = c & 3;
    rankCount[r]++;
    suitCount[s]++;
    suitMask[s] |= 1 << r;
    rankMask |= 1 << r;
  }

  for (let s = 0; s < 4; s++) {
    if (suitCount[s] >= 5) {
      const sf = straightHigh(suitMask[s]);
      if (sf) return score(HandCategory.StraightFlush, [sf]);
      return score(HandCategory.Flush, topRanksFromMask(suitMask[s], 5));
    }
  }

  let quad = 0;
  const trips: number[] = [];
  const pairs: number[] = [];
  for (let r = 14; r >= 2; r--) {
    const n = rankCount[r];
    if (n === 4) quad = r;
    else if (n === 3) trips.push(r);
    else if (n === 2) pairs.push(r);
  }

  if (quad) {
    return score(HandCategory.Quads, [quad, ...topRanksFromMask(rankMask & ~(1 << quad), 1)]);
  }
  if (trips.length > 0) {
    const pairRank = Math.max(trips[1] ?? 0, pairs[0] ?? 0);
    if (pairRank) return score(HandCategory.FullHouse, [trips[0], pairRank]);
  }
  const straight = straightHigh(rankMask);
  if (straight) return score(HandCategory.Straight, [straight]);
  if (trips.length > 0) {
    return score(HandCategory.Trips, [trips[0], ...topRanksFromMask(rankMask & ~(1 << trips[0]), 2)]);
  }
  if (pairs.length >= 2) {
    const [p1, p2] = pairs;
    return score(HandCategory.TwoPair, [p1, p2, ...topRanksFromMask(rankMask & ~(1 << p1) & ~(1 << p2), 1)]);
  }
  if (pairs.length === 1) {
    return score(HandCategory.Pair, [pairs[0], ...topRanksFromMask(rankMask & ~(1 << pairs[0]), 3)]);
  }
  return score(HandCategory.HighCard, topRanksFromMask(rankMask, 5));
}

/** Evaluate exactly five cards. */
export function evaluate5(cards: readonly Card[]): number {
  if (cards.length !== 5) throw new Error('evaluate5 needs exactly 5 cards');
  return evaluateIndices(cards.map(cardIndex));
}

/** Best 5-card score from 5 to 7 cards. */
export function evaluate(cards: readonly Card[]): number {
  if (cards.length < 5 || cards.length > 7) throw new Error('evaluate needs 5 to 7 cards');
  return evaluateIndices(cards.map(cardIndex));
}

export function categoryOf(scoreValue: number): HandCategory {
  return (scoreValue >> 20) as HandCategory;
}

/** The five significance-ordered ranks encoded in a score (0 for unused slots). */
export function ranksOf(scoreValue: number): number[] {
  return [16, 12, 8, 4, 0].map((shift) => (scoreValue >> shift) & 0xf);
}
