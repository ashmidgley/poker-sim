import { readJson, writeJson, type KeyValueStore } from './kv';
import type { StoredHand } from './types';

const KEY = 'retry-queue';
export const QUEUE_EVENT = 'poker-sim:retry-queue';

/**
 * Hands whose save to the API failed (PLAN 7.2). Stored in order and
 * flushed oldest first; hand ids make retries safe.
 */
export class RetryQueue {
  constructor(private store: KeyValueStore) {}

  items(): StoredHand[] {
    return readJson<StoredHand[]>(this.store, KEY, []);
  }

  size(): number {
    return this.items().length;
  }

  enqueue(hand: StoredHand): void {
    const items = this.items();
    if (items.some((h) => h.id === hand.id)) return;
    writeJson(this.store, KEY, [...items, hand]);
    this.notify();
  }

  /**
   * Send queued hands in order. Stops at the first failure so order is kept;
   * returns how many were sent.
   */
  async flush(send: (hand: StoredHand) => Promise<void>): Promise<number> {
    let sent = 0;
    for (const hand of this.items()) {
      try {
        await send(hand);
      } catch {
        break;
      }
      writeJson(
        this.store,
        KEY,
        this.items().filter((h) => h.id !== hand.id),
      );
      sent++;
    }
    if (sent > 0) this.notify();
    return sent;
  }

  private notify() {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(QUEUE_EVENT));
  }
}
