import { describe, expect, it } from 'vitest';
import { parseCards, rankOf, suitOf, type Card } from '../cards';
import { shuffledDeck } from '../deck';
import { describeScore } from '../describe';
import { categoryOf, evaluate, evaluate5, HandCategory } from '../evaluator';
import { mulberry32 } from '../rng';

const ev = (s: string) => evaluate(parseCards(s));

/**
 * Independent, deliberately naive 5-card ranker used as a reference.
 * Returns a tuple compared lexicographically.
 */
function reference5(cards: Card[]): number[] {
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const flush = new Set(cards.map(suitOf)).size === 1;
  const uniq = [...new Set(ranks)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
    else if (ranks.join(',') === '14,5,4,3,2') straightHigh = 5;
  }
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  // Group by count desc, then rank desc.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const byGroup = groups.map((g) => g[0]);
  const shape = groups.map((g) => g[1]).join('');
  if (straightHigh && flush) return [8, straightHigh];
  if (shape === '41') return [7, ...byGroup];
  if (shape === '32') return [6, ...byGroup];
  if (flush) return [5, ...ranks];
  if (straightHigh) return [4, straightHigh];
  if (shape === '311') return [3, ...byGroup];
  if (shape === '221') return [2, ...byGroup];
  if (shape === '2111') return [1, ...byGroup];
  return [0, ...ranks];
}

function cmpTuple(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function bestReference(cards: Card[]): number[] {
  let best: number[] | null = null;
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const t = reference5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || cmpTuple(t, best) > 0) best = t;
          }
  return best!;
}

describe('Evaluator ranking', () => {
  it('ranks one example of each category in order', () => {
    const hands = [
      '2c 5d 9h Js Kc', // high card
      '2c 2d 9h Js Kc', // pair
      '2c 2d 9h 9s Kc', // two pair
      '2c 2d 2h 9s Kc', // trips
      '5c 6d 7h 8s 9c', // straight
      '2h 5h 9h Jh Kh', // flush
      '2c 2d 2h 9s 9c', // full house
      '2c 2d 2h 2s 9c', // quads
      '5d 6d 7d 8d 9d', // straight flush
    ].map((h) => evaluate5(parseCards(h)));
    hands.forEach((s, i) => expect(categoryOf(s)).toBe(i));
    for (let i = 1; i < hands.length; i++) expect(hands[i]).toBeGreaterThan(hands[i - 1]);
  });

  it('the wheel loses to a six-high straight', () => {
    const wheel = ev('Ac 2d 3h 4s 5c');
    const six = ev('2d 3h 4s 5c 6d');
    expect(categoryOf(wheel)).toBe(HandCategory.Straight);
    expect(six).toBeGreaterThan(wheel);
    expect(describeScore(wheel)).toBe('Straight, five high');
  });

  it('recognises a wheel straight flush', () => {
    const s = ev('Ah 2h 3h 4h 5h Kc Kd');
    expect(categoryOf(s)).toBe(HandCategory.StraightFlush);
    expect(s).toBeGreaterThan(ev('Kh Kc Kd Ks 2c'));
    expect(s).toBeLessThan(ev('2h 3h 4h 5h 6h'));
  });

  it('kickers decide between equal pairs, two pairs and flushes', () => {
    expect(ev('Ac Ad Kh 7s 3c')).toBeGreaterThan(ev('As Ah Qh 7d 3d'));
    expect(ev('Ac Ad 9h 7s 4c')).toBeGreaterThan(ev('As Ah 9d 7c 3d'));
    expect(ev('Kc Kd 7h 7s Ac')).toBeGreaterThan(ev('Ks Kh 7d 7c Qd'));
    expect(ev('Kc Kd 8h 8s 2c')).toBeGreaterThan(ev('Ks Kh 7d 7c Ad'));
    expect(ev('Ah Kh 9h 7h 4h')).toBeGreaterThan(ev('Ad Kd 9d 7d 3d'));
  });

  it('chooses the best five of seven', () => {
    // Board pairs make a full house rather than two pair + kicker.
    const s = ev('Kc Kd 7h 7s 7c 2d 3h');
    expect(categoryOf(s)).toBe(HandCategory.FullHouse);
    expect(describeScore(s)).toBe('Full house, sevens full of kings');
    // Two trips: higher trips full of the lower.
    expect(describeScore(ev('9c 9d 9h 4s 4c 4d Ah'))).toBe('Full house, nines full of fours');
    // Three pairs: best two plus best kicker.
    expect(ev('Ac Ad Kh Ks Qc Qd 2h')).toBe(ev('Ac Ad Kh Ks Qc 3d 2h'));
    // Six-card straight uses the top five.
    expect(describeScore(ev('4c 5d 6h 7s 8c 9d 2h'))).toBe('Straight, nine high');
    // Flush with six suited cards uses the top five.
    expect(ev('2h 4h 6h 8h Th Qh Ac')).toBe(ev('4h 6h 8h Th Qh'));
  });

  it('identical ranks in different suits tie', () => {
    expect(ev('Ac Kd 9h 7s 4c')).toBe(ev('Ad Kh 9s 7c 4d'));
    expect(ev('As Ks Qd Jc Th 2c 2d')).toBe(ev('Ah Kh Qc Js Td 3c 3d'));
  });

  it('matches a naive best-of-subsets reference on 20,000 random 7-card hands', () => {
    const rng = mulberry32(12345);
    for (let i = 0; i < 20000; i++) {
      const a = shuffledDeck(rng).slice(0, 7);
      const b = shuffledDeck(rng).slice(0, 7);
      const fast = Math.sign(evaluate(a) - evaluate(b));
      const slow = Math.sign(cmpTuple(bestReference(a), bestReference(b)));
      if (fast !== slow) throw new Error(`Mismatch: ${a.join('')} vs ${b.join('')}`);
      // Categories agree too.
      expect(categoryOf(evaluate(a))).toBe(bestReference(a)[0]);
    }
  });

  it('describes hands in plain English', () => {
    expect(describeScore(ev('Kc Kd 7h 7s 2c'))).toBe('Two pair, kings and sevens');
    expect(describeScore(ev('Kc Kd 8h 7s 2c'))).toBe('Pair of kings');
    expect(describeScore(ev('Ah Kh Qh Jh Th'))).toBe('Royal flush');
    expect(describeScore(ev('Kc Td 8h 7s 2c'))).toBe('King high');
  });
});
