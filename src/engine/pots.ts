import type { HandEvent, Pot, SeatState } from './types';

/**
 * Return the part of the highest street commitment that nobody matched.
 * Folded seats count: a folded seat that put in more than anyone still in
 * gets its excess back (e.g. a small blind facing a big blind all-in short).
 * Mutates `seats`; returns the event, or null when nothing was uncalled.
 */
export function returnUncalled(seats: SeatState[]): HandEvent | null {
  if (seats.length < 2) return null;
  const sorted = seats.map((s) => s.committedStreet).sort((a, b) => b - a);
  const [highest, second] = sorted;
  if (highest === second) return null;
  const seat = seats.find((s) => s.committedStreet === highest)!;
  const amount = highest - second;
  seat.stack += amount;
  seat.committedStreet -= amount;
  seat.committedHand -= amount;
  if (seat.status === 'allIn' && seat.stack > 0) seat.status = 'active';
  return { type: 'uncalled_returned', seat: seat.seat, amount };
}

/** Build the main pot and side pots from each seat's total commitment this hand. */
export function buildPots(seats: readonly SeatState[]): Pot[] {
  const live = seats.filter((s) => s.status !== 'folded');
  const levels = [...new Set(live.map((s) => s.committedHand))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const s of seats) amount += Math.min(s.committedHand, level) - Math.min(s.committedHand, prev);
    const eligible = live.filter((s) => s.committedHand >= level).map((s) => s.seat);
    if (amount > 0) pots.push({ amount, eligible });
    prev = level;
  }
  // Chips above the top level (should not occur after the uncalled return).
  const total = seats.reduce((sum, s) => sum + s.committedHand, 0);
  const counted = pots.reduce((sum, p) => sum + p.amount, 0);
  if (total > counted) {
    if (pots.length === 0) pots.push({ amount: 0, eligible: live.map((s) => s.seat) });
    pots[pots.length - 1].amount += total - counted;
  }
  // Merge adjacent pots with identical eligibility.
  const merged: Pot[] = [];
  for (const p of pots) {
    const last = merged[merged.length - 1];
    if (last && last.eligible.join(',') === p.eligible.join(',')) last.amount += p.amount;
    else merged.push({ amount: p.amount, eligible: [...p.eligible] });
  }
  return merged;
}

/**
 * Split `amount` evenly among `winners`. Odd cents go one at a time to the
 * winners in clockwise order starting with the first seat left of the button.
 */
export function splitPot(
  amount: number,
  winners: readonly number[],
  buttonSeat: number,
): { seat: number; amount: number }[] {
  const ordered = [...winners].sort((a, b) => clockwiseDistance(buttonSeat, a) - clockwiseDistance(buttonSeat, b));
  const share = Math.floor(amount / ordered.length);
  let remainder = amount - share * ordered.length;
  return ordered.map((seat) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { seat, amount: share + extra };
  });
}

/** Distance clockwise from `from` to `to` among seat numbers 0..8; `from` itself is 9 (last). */
function clockwiseDistance(from: number, to: number): number {
  const d = (to - from + 9) % 9;
  return d === 0 ? 9 : d;
}
