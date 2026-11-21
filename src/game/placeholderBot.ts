import type { Action, LegalActions, Rng } from '@/engine';

/**
 * Phase 2 placeholder: checks when it can, otherwise calls 70% of the time
 * and folds 30%. Never raises. Replaced by the archetype bots in Phase 3.
 */
export function placeholderDecide(legal: LegalActions, rng: Rng): Action {
  if (legal.canCheck) return { type: 'check', seat: legal.seat };
  return rng() < 0.7 ? { type: 'call', seat: legal.seat } : { type: 'fold', seat: legal.seat };
}
