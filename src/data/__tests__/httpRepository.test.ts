import { describe, expect, it } from 'vitest';
import { HttpRepository } from '../httpRepository';
import { MemoryStore } from '../kv';
import { RetryQueue } from '../retryQueue';
import type { StoredHand } from '../types';

const hand = (id: string) => ({ id, handNumber: 1 }) as unknown as StoredHand;

/** A fake fetch: responds per call from a list of [status, body] or throws for 'offline'. */
function fakeFetch(responses: ([number, unknown] | 'offline')[]) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method!, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const next = responses.shift() ?? [200, {}];
    if (next === 'offline') throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(next[1]), { status: next[0] });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('HttpRepository', () => {
  it('maps API errors to DataError codes', async () => {
    const { fn } = fakeFetch([[409, { error: 'insufficient_bankroll' }], [503, { error: 'no_database' }], [418, {}]]);
    const repo = new HttpRepository(new RetryQueue(new MemoryStore()), fn);
    await expect(repo.rebuy('s', 100)).rejects.toMatchObject({ code: 'insufficient_bankroll' });
    await expect(repo.getBankroll()).rejects.toMatchObject({ code: 'no_database' });
    await expect(repo.getSettings()).rejects.toMatchObject({ code: 'server' });
  });

  it('returns null for a missing session or hand', async () => {
    const { fn } = fakeFetch([[404, { error: 'not_found' }], [404, { error: 'not_found' }]]);
    const repo = new HttpRepository(new RetryQueue(new MemoryStore()), fn);
    expect(await repo.getSession('x')).toBeNull();
    expect(await repo.getHand('x')).toBeNull();
  });

  it('queues a hand when the save fails offline, then flushes it before the next save', async () => {
    const queue = new RetryQueue(new MemoryStore());
    const { fn, calls } = fakeFetch(['offline', [201, { ok: true }], [201, { ok: true }]]);
    const repo = new HttpRepository(queue, fn);

    await repo.saveHand(hand('a')); // offline: queued, does not reject
    expect(queue.size()).toBe(1);

    await repo.saveHand(hand('b')); // flushes 'a' first, then saves 'b'
    expect(queue.size()).toBe(0);
    expect(calls.map((c) => (c.body as { hand: { id: string } }).hand.id)).toEqual(['a', 'a', 'b']);
  });

  it('keeps order: while older hands still fail, new hands join the queue behind them', async () => {
    const queue = new RetryQueue(new MemoryStore());
    const { fn } = fakeFetch(['offline', 'offline']);
    const repo = new HttpRepository(queue, fn);
    await repo.saveHand(hand('a'));
    await repo.saveHand(hand('b'));
    expect(queue.items().map((h) => h.id)).toEqual(['a', 'b']);
  });

  it('rejects instead of queueing when the server says the hand is invalid', async () => {
    const queue = new RetryQueue(new MemoryStore());
    const { fn } = fakeFetch([[400, { error: 'invalid' }]]);
    await expect(new HttpRepository(queue, fn).saveHand(hand('a'))).rejects.toMatchObject({ code: 'invalid' });
    expect(queue.size()).toBe(0);
  });
});
