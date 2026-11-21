'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { explain, madeHandLabel, pct, type Explanation } from '@/analysis/explain';
import { deriveSeed, type Card, type EquityResult, type HandState, type PlayerOuts } from '@/engine';
import { EquityClient } from '@/workers/equityClient';

export interface SeatLearning {
  winPct: string | null; // null while computing or when folded
  leader: boolean;
  madeHand: string; // what the seat holds now (folded seats too: "would hold")
  outs: Card[] | null; // next-card outs when behind on the flop or turn
}

export interface Learning {
  seats: Map<number, SeatLearning>;
  explanation: Explanation | null;
  computing: boolean;
}

interface Result {
  key: string;
  seats: number[]; // contender seats, in the order sent
  equities: EquityResult[];
  outs: PlayerOuts[];
}

/**
 * Learning mode analysis for a hand: equity per contender from the worker,
 * made hands, outs, the leader and the explanation (PLAN 9.3). Recomputed
 * whenever the board or the set of contenders changes.
 */
export function useLearning(
  hand: HandState | null,
  opts: { enabled: boolean; heroSeat: number; name: (seat: number) => string; heroToAct: boolean },
): Learning | null {
  const { enabled, heroSeat, name, heroToAct } = opts;
  const clientRef = useRef<EquityClient | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  // One worker per mounted table, only while learning is on.
  useEffect(() => {
    if (!enabled) return;
    const client = new EquityClient();
    clientRef.current = client;
    return () => {
      client.terminate();
      clientRef.current = null;
    };
  }, [enabled]);

  const contenders = hand ? hand.seats.filter((s) => s.status !== 'folded') : [];
  const key = hand ? `${hand.input.handId}|${hand.board.length}|${contenders.map((s) => s.seat).join(',')}` : '';

  useEffect(() => {
    const client = clientRef.current;
    if (!enabled || !hand || !client || contenders.length < 1) return;
    const seats = contenders.map((s) => s.seat);
    const hands = contenders.map((s) => [s.holeCards[0], s.holeCards[1]] as [Card, Card]);
    const seed = (deriveSeed(hand.input.sessionSeed, hand.input.handNumber, 'equity') ^ hand.board.length) >>> 0;
    let cancelled = false;
    client
      .request(hands, hand.board.slice(), seed)
      .then((res) => {
        if (!cancelled && res) {
          setResult({ key, seats, equities: res.equities, outs: res.outs });
          setError(null);
        }
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
    // The key captures everything that changes the answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return useMemo(() => {
    if (!enabled || !hand) return null;
    const fresh = result && result.key === key ? result : null;
    const equityOf = new Map<number, number>();
    const outsOf = new Map<number, Card[]>();
    if (fresh) {
      fresh.seats.forEach((seat, i) => equityOf.set(seat, fresh.equities[i].equity));
      for (const o of fresh.outs) outsOf.set(fresh.seats[o.seatIndex], o.outs);
    }

    const explanation = fresh
      ? explain({
          players: hand.seats.map((s) => ({
            seat: s.seat,
            name: s.seat === heroSeat ? 'You' : name(s.seat),
            isHero: s.seat === heroSeat,
            cards: s.holeCards,
            folded: s.status === 'folded',
            equity: s.status === 'folded' ? null : (equityOf.get(s.seat) ?? null),
            outs: outsOf.get(s.seat) ?? (s.status === 'folded' ? null : []),
          })),
          board: hand.board,
          pot: hand.seats.reduce((a, s) => a + s.committedHand, 0),
          toCall: Math.max(0, hand.currentBet - (hand.seats.find((s) => s.seat === heroSeat)?.committedStreet ?? 0)),
          heroToAct: heroToAct,
        })
      : null;

    const seats = new Map<number, SeatLearning>();
    for (const s of hand.seats) {
      const eq = equityOf.get(s.seat);
      seats.set(s.seat, {
        winPct: s.status === 'folded' || eq === undefined ? null : pct(eq),
        leader: !!explanation?.leaderSeats.includes(s.seat),
        madeHand: madeHandLabel(s.holeCards, hand.board),
        outs: outsOf.get(s.seat) ?? null,
      });
    }
    return { seats, explanation, computing: !fresh && !error };
  }, [enabled, heroSeat, name, heroToAct, hand, result, key, error]);
}
