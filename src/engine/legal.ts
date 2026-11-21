import type { HandState, LegalActions, SeatState } from './types';

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalActionError';
  }
}

export function seatByNumber(state: HandState, seat: number): SeatState {
  const s = state.seats.find((x) => x.seat === seat);
  if (!s) throw new Error(`Seat ${seat} is not in this hand`);
  return s;
}

export function legalActions(state: HandState): LegalActions | null {
  if (state.phase === 'complete' || state.toAct === null) return null;
  const s = seatByNumber(state, state.toAct);
  const toCall = Math.max(0, state.currentBet - s.committedStreet);
  const otherActive = state.seats.some((o) => o.seat !== s.seat && o.status === 'active');

  let raise: LegalActions['raise'] = null;
  if (s.raiseRightsOpen && s.stack > toCall && otherActive) {
    const maxTo = s.committedStreet + s.stack;
    const minTo = Math.min(state.currentBet + state.lastFullRaiseSize, maxTo);
    raise = { kind: state.currentBet === 0 ? 'bet' : 'raise', minTo, maxTo };
  }

  return {
    seat: s.seat,
    canFold: true,
    canCheck: toCall === 0,
    callAmount: toCall === 0 ? 0 : Math.min(toCall, s.stack),
    raise,
  };
}
