import type { Card } from './cards';
import { remainingCards } from './deck';
import { evaluate } from './evaluator';

export interface PlayerOuts {
  seatIndex: number; // index into the `hands` argument
  outs: Card[];
}

/**
 * For a flop or turn board: for each player not currently ahead (strictly
 * behind the best hand), the unseen cards that would put them in the lead or
 * in a tie for it if dealt next.
 */
export function nextCardOuts(hands: readonly [Card, Card][], board: readonly Card[]): PlayerOuts[] {
  if (board.length !== 3 && board.length !== 4) return [];
  const now = hands.map((h) => evaluate([...h, ...board]));
  const best = Math.max(...now);
  const unseenCards = remainingCards([...hands.flat(), ...board]);
  const result: PlayerOuts[] = [];

  hands.forEach((hand, i) => {
    if (now[i] === best) return;
    const outs: Card[] = [];
    for (const card of unseenCards) {
      const next = [...board, card];
      const mine = evaluate([...hand, ...next]);
      let others = -1;
      hands.forEach((h, j) => {
        if (j !== i) others = Math.max(others, evaluate([...h, ...next]));
      });
      if (mine >= others) outs.push(card);
    }
    result.push({ seatIndex: i, outs });
  });
  return result;
}
