import { rankOf, suitOf, type Card } from '@/engine';

/** Chen formula points for the higher card (PLAN 5.1). */
function highCardPoints(rank: number): number {
  if (rank === 14) return 10;
  if (rank === 13) return 8;
  if (rank === 12) return 7;
  if (rank === 11) return 6;
  return rank / 2; // T = 5, 9 = 4.5, ... 2 = 1
}

/**
 * Bill Chen's preflop hand strength score. Higher is stronger; AA = 20,
 * 72o = -1. Fractions are rounded half up at the end.
 */
export function chenScore(hole: readonly [Card, Card]): number {
  const [a, b] = hole;
  const ra = rankOf(a);
  const rb = rankOf(b);
  const high = Math.max(ra, rb);
  const low = Math.min(ra, rb);

  let score = highCardPoints(high);
  if (ra === rb) {
    score = Math.max(score * 2, 5);
  } else {
    if (suitOf(a) === suitOf(b)) score += 2;
    const gap = high - low - 1;
    if (gap === 1) score -= 1;
    else if (gap === 2) score -= 2;
    else if (gap === 3) score -= 4;
    else if (gap >= 4) score -= 5;
    if (gap <= 1 && high < 12) score += 1;
  }
  return Math.floor(score + 0.5);
}
