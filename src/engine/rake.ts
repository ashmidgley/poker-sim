import type { Pot, RakeConfig } from './types';

/** Rake on a total pot, per PLAN section 4.6. */
export function computeRake(total: number, config: RakeConfig, flopDealt: boolean): number {
  if (config.noFlopNoDrop && !flopDealt) return 0;
  const roundTo = Math.max(1, config.roundTo);
  let raw = Math.floor((total * config.percentBps) / 10000);
  raw = Math.floor(raw / roundTo) * roundTo;
  return config.cap > 0 ? Math.min(raw, config.cap) : raw;
}

/** Deduct rake from the main pot first, then side pots in order. Returns the per-pot deduction. */
export function deductRake(pots: Pot[], rake: number): number[] {
  const fromPots = pots.map(() => 0);
  let left = rake;
  for (let i = 0; i < pots.length && left > 0; i++) {
    const take = Math.min(left, pots[i].amount);
    pots[i].amount -= take;
    fromPots[i] = take;
    left -= take;
  }
  return fromPots;
}
