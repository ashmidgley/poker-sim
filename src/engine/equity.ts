import type { Card } from './cards';
import { fullDeck } from './deck';
import { cardIndex, evaluateIndices } from './evaluator';
import type { Rng } from './rng';

export interface EquityResult {
  win: number; // fraction of runouts won outright
  tie: number; // fraction of runouts tied for the best hand
  equity: number; // win + share of ties
}

export const PREFLOP_KNOWN_ITERATIONS = 20000;
export const BOT_ITERATIONS = 500;
export const UI_ITERATIONS = 5000;

function unseen(used: readonly number[]): number[] {
  const set = new Set(used);
  return fullDeck()
    .map(cardIndex)
    .filter((c) => !set.has(c));
}

/** Draw k cards into positions 0..k-1 of `pool` with a partial Fisher-Yates shuffle. */
function drawInto(pool: number[], k: number, rng: Rng): void {
  const n = pool.length;
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (n - i));
    const t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
  }
}

class Tally {
  wins: Float64Array;
  ties: Float64Array;
  shares: Float64Array;
  runs = 0;
  constructor(n: number) {
    this.wins = new Float64Array(n);
    this.ties = new Float64Array(n);
    this.shares = new Float64Array(n);
  }
  add(scores: ArrayLike<number>, n: number): void {
    let best = -1;
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (scores[i] > best) {
        best = scores[i];
        count = 1;
      } else if (scores[i] === best) count++;
    }
    for (let i = 0; i < n; i++) {
      if (scores[i] !== best) continue;
      if (count === 1) this.wins[i]++;
      else this.ties[i]++;
      this.shares[i] += 1 / count;
    }
    this.runs++;
  }
  results(n: number): EquityResult[] {
    const out: EquityResult[] = [];
    for (let i = 0; i < n; i++) {
      out.push({ win: this.wins[i] / this.runs, tie: this.ties[i] / this.runs, equity: this.shares[i] / this.runs });
    }
    return out;
  }
}

/**
 * Equity with every hand known. Exact enumeration on the flop, turn and
 * river; Monte Carlo (20,000 runouts) preflop.
 */
export function equityKnown(
  hands: readonly [Card, Card][],
  board: readonly Card[],
  rng: Rng,
  preflopIterations = PREFLOP_KNOWN_ITERATIONS,
): EquityResult[] {
  const n = hands.length;
  if (n < 2) return hands.map(() => ({ win: 1, tie: 0, equity: 1 }));
  if (![0, 3, 4, 5].includes(board.length)) throw new Error('Board must have 0, 3, 4 or 5 cards');

  const holes = hands.map((h) => [cardIndex(h[0]), cardIndex(h[1])]);
  const boardIdx = board.map(cardIndex);
  const pool = unseen([...holes.flat(), ...boardIdx]);
  const needed = 5 - board.length;

  const seven = new Int32Array(7);
  const scores = new Int32Array(n);
  const fullBoard = new Int32Array(5);
  boardIdx.forEach((c, i) => (fullBoard[i] = c));
  const tally = new Tally(n);

  const scoreAll = () => {
    for (let p = 0; p < n; p++) {
      seven[0] = holes[p][0];
      seven[1] = holes[p][1];
      for (let i = 0; i < 5; i++) seven[2 + i] = fullBoard[i];
      scores[p] = evaluateIndices(seven, 7);
    }
    tally.add(scores, n);
  };

  const b = board.length;
  if (needed === 0) {
    scoreAll();
  } else if (needed === 1) {
    for (const c of pool) {
      fullBoard[b] = c;
      scoreAll();
    }
  } else if (needed === 2) {
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        fullBoard[b] = pool[i];
        fullBoard[b + 1] = pool[j];
        scoreAll();
      }
    }
  } else {
    for (let it = 0; it < preflopIterations; it++) {
      drawInto(pool, needed, rng);
      for (let k = 0; k < needed; k++) fullBoard[b + k] = pool[k];
      scoreAll();
    }
  }
  return tally.results(n);
}

/** One hand against `opponents` random hands. Always Monte Carlo. */
export function equityVsRandom(
  hand: [Card, Card],
  board: readonly Card[],
  opponents: number,
  iterations: number,
  rng: Rng,
): EquityResult {
  if (opponents < 1) return { win: 1, tie: 0, equity: 1 };
  const hole = [cardIndex(hand[0]), cardIndex(hand[1])];
  const boardIdx = board.map(cardIndex);
  const pool = unseen([...hole, ...boardIdx]);
  const needed = 5 - board.length;
  const draw = needed + opponents * 2;
  const seven = new Int32Array(7);
  const fullBoard = new Int32Array(5);
  boardIdx.forEach((c, i) => (fullBoard[i] = c));

  let wins = 0;
  let ties = 0;
  let shares = 0;
  for (let it = 0; it < iterations; it++) {
    drawInto(pool, draw, rng);
    for (let k = 0; k < needed; k++) fullBoard[board.length + k] = pool[k];
    for (let i = 0; i < 5; i++) seven[2 + i] = fullBoard[i];

    seven[0] = hole[0];
    seven[1] = hole[1];
    const hero = evaluateIndices(seven, 7);
    let bestOpp = -1;
    let oppAtBest = 0;
    for (let o = 0; o < opponents; o++) {
      seven[0] = pool[needed + o * 2];
      seven[1] = pool[needed + o * 2 + 1];
      const s = evaluateIndices(seven, 7);
      if (s > bestOpp) {
        bestOpp = s;
        oppAtBest = 1;
      } else if (s === bestOpp) oppAtBest++;
    }
    if (hero > bestOpp) {
      wins++;
      shares++;
    } else if (hero === bestOpp) {
      ties++;
      shares += 1 / (oppAtBest + 1);
    }
  }
  return { win: wins / iterations, tie: ties / iterations, equity: shares / iterations };
}
