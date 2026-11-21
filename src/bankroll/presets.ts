import type { RakeConfig } from '@/engine';

/**
 * Stakes and rake presets (PLAN 9.1). All amounts are cents.
 * Created early (Phase 2) because the setup form needs stakes; Phase 6 adds
 * the custom rake and stakes fields to the form.
 */

export interface StakesPreset {
  id: string;
  label: string;
  smallBlind: number;
  bigBlind: number;
}

export const STAKES_PRESETS: StakesPreset[] = [
  { id: '1/2', label: '$1/$2', smallBlind: 100, bigBlind: 200 },
  { id: '2/5', label: '$2/$5', smallBlind: 200, bigBlind: 500 },
  { id: '5/10', label: '$5/$10', smallBlind: 500, bigBlind: 1000 },
];

export type RakePresetId = 'live' | 'online' | 'none' | 'custom';

export const RAKE_PRESETS: Record<Exclude<RakePresetId, 'custom'>, { label: string; rake: RakeConfig }> = {
  live: { label: 'Live: 10%, $6 cap', rake: { percentBps: 1000, cap: 600, roundTo: 100, noFlopNoDrop: true } },
  online: { label: 'Online: 5%, $3 cap', rake: { percentBps: 500, cap: 300, roundTo: 1, noFlopNoDrop: true } },
  none: { label: 'No rake', rake: { percentBps: 0, cap: 0, roundTo: 1, noFlopNoDrop: true } },
};

export const DEFAULT_RAKE_PRESET: Exclude<RakePresetId, 'custom'> = 'live';

export const MIN_OPPONENTS = 1;
export const MAX_OPPONENTS = 8;
export const DEFAULT_OPPONENTS = 3;
