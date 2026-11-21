import { RANKS, SUITS, type Card } from './cards';
import { randInt, type Rng } from './rng';

/** The 52 cards in a fixed order: 2c 2d 2h 2s 3c ... As. */
export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const r of RANKS) for (const s of SUITS) deck.push(r + s);
  return deck;
}

/** Fisher-Yates shuffle. Returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

export function shuffledDeck(rng: Rng): Card[] {
  return shuffle(fullDeck(), rng);
}

/** Cards from the full deck not in `used`. */
export function remainingCards(used: readonly Card[]): Card[] {
  const set = new Set(used);
  return fullDeck().filter((c) => !set.has(c));
}
