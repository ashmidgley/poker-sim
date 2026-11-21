/** A card is rank (23456789TJQKA) then suit (cdhs), e.g. "As", "Td". */
export type Card = string;

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';

/** Rank value 2..14 (ace high). */
export function rankOf(card: Card): number {
  const i = RANKS.indexOf(card[0]);
  if (i < 0) throw new Error(`Bad card: ${card}`);
  return i + 2;
}

/** Suit index 0..3. */
export function suitOf(card: Card): number {
  const i = SUITS.indexOf(card[1]);
  if (i < 0) throw new Error(`Bad card: ${card}`);
  return i;
}

export function isCard(value: string): boolean {
  return value.length === 2 && RANKS.includes(value[0]) && SUITS.includes(value[1]);
}

/** Parse "AsKd" or "As Kd" into cards. */
export function parseCards(text: string): Card[] {
  const compact = text.replace(/\s+/g, '');
  if (compact.length % 2 !== 0) throw new Error(`Bad card list: ${text}`);
  const out: Card[] = [];
  for (let i = 0; i < compact.length; i += 2) {
    const c = compact.slice(i, i + 2);
    if (!isCard(c)) throw new Error(`Bad card: ${c}`);
    out.push(c);
  }
  return out;
}

export function formatCards(cards: readonly Card[]): string {
  return cards.join('');
}

const RANK_NAMES: Record<number, [string, string]> = {
  2: ['deuce', 'deuces'],
  3: ['three', 'threes'],
  4: ['four', 'fours'],
  5: ['five', 'fives'],
  6: ['six', 'sixes'],
  7: ['seven', 'sevens'],
  8: ['eight', 'eights'],
  9: ['nine', 'nines'],
  10: ['ten', 'tens'],
  11: ['jack', 'jacks'],
  12: ['queen', 'queens'],
  13: ['king', 'kings'],
  14: ['ace', 'aces'],
};

export function rankName(rank: number, plural = false): string {
  return RANK_NAMES[rank][plural ? 1 : 0];
}
