import type { HandEvent } from '@/engine';
import { readJson, writeJson, type KeyValueStore } from '@/data/kv';

/**
 * What a table needs to resume after a refresh (PLAN 9.2): stacks, button and
 * the last hand number. Saved when a hand starts (marked in progress, with the
 * pre-hand stacks), when it completes, and after rebuys.
 *
 * A hand in progress during a refresh is void: stacks return to their
 * pre-hand values and nothing is saved. Its hand number is still used up, so
 * the next deal is a fresh shuffle rather than the same cards again.
 */
export interface LiveState {
  handNumber: number; // last hand started
  button: number | null;
  stacks: Record<number, number>; // seat -> stack (pre-hand stacks while inProgress)
  inProgress: boolean;
}

const key = (sessionId: string) => `live:${sessionId}`;

export function loadLiveState(store: KeyValueStore, sessionId: string): LiveState | null {
  return readJson<LiveState | null>(store, key(sessionId), null);
}

export function saveLiveState(store: KeyValueStore, sessionId: string, live: LiveState): void {
  try {
    writeJson(store, key(sessionId), live);
  } catch {
    // Storage full or unavailable: resume falls back to the last saved hand.
  }
}

export function clearLiveState(store: KeyValueStore, sessionId: string): void {
  try {
    store.removeItem(`poker-sim:${key(sessionId)}`);
  } catch {
    // ignore
  }
}

/** Fallback for another browser: rebuild live state from the last stored hand's events. */
export function liveStateFromHand(events: readonly HandEvent[]): LiveState | null {
  const started = events.find((e) => e.type === 'hand_started');
  const completed = events.find((e) => e.type === 'hand_completed');
  if (!started || started.type !== 'hand_started' || !completed || completed.type !== 'hand_completed') return null;
  const stacks: Record<number, number> = {};
  for (const s of completed.stacks) stacks[s.seat] = s.stack;
  return { handNumber: started.handNumber, button: started.buttonSeat, stacks, inProgress: false };
}
