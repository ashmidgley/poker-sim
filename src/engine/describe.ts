import { rankName } from './cards';
import { categoryOf, HandCategory, ranksOf } from './evaluator';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Full description, e.g. "Two pair, kings and sevens". */
export function describeScore(score: number): string {
  const [r1, r2] = ranksOf(score);
  switch (categoryOf(score)) {
    case HandCategory.StraightFlush:
      return r1 === 14 ? 'Royal flush' : `Straight flush, ${rankName(r1)} high`;
    case HandCategory.Quads:
      return `Four of a kind, ${rankName(r1, true)}`;
    case HandCategory.FullHouse:
      return `Full house, ${rankName(r1, true)} full of ${rankName(r2, true)}`;
    case HandCategory.Flush:
      return `Flush, ${rankName(r1)} high`;
    case HandCategory.Straight:
      return `Straight, ${rankName(r1)} high`;
    case HandCategory.Trips:
      return `Three of a kind, ${rankName(r1, true)}`;
    case HandCategory.TwoPair:
      return `Two pair, ${rankName(r1, true)} and ${rankName(r2, true)}`;
    case HandCategory.Pair:
      return `Pair of ${rankName(r1, true)}`;
    default:
      return `${cap(rankName(r1))} high`;
  }
}

/** Short category label, e.g. "Two pair". */
export function categoryName(score: number): string {
  return [
    'High card',
    'Pair',
    'Two pair',
    'Three of a kind',
    'Straight',
    'Flush',
    'Full house',
    'Four of a kind',
    'Straight flush',
  ][categoryOf(score)];
}
