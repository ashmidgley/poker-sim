import { equityKnown, mulberry32, nextCardOuts, type Card, type EquityResult, type PlayerOuts } from '@/engine';

/** Messages between the page and the equity worker. Pure: no DOM or worker APIs. */

export interface EquityRequest {
  id: number;
  hands: [Card, Card][]; // contenders only
  board: Card[];
  seed: number; // seeds the preflop Monte Carlo so results are reproducible
}

export type EquityResponse =
  | { id: number; ok: true; equities: EquityResult[]; outs: PlayerOuts[]; ms: number }
  | { id: number; ok: false; error: string };

/** The calculation itself, shared by the worker and the same-thread fallback. */
export function computeEquity(req: EquityRequest, now: () => number): EquityResponse {
  const t0 = now();
  try {
    const equities = equityKnown(req.hands, req.board, mulberry32(req.seed));
    const outs = nextCardOuts(req.hands, req.board);
    return { id: req.id, ok: true, equities, outs, ms: now() - t0 };
  } catch (e) {
    return { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
