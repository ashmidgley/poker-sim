import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../kv';
import { LocalRepository } from '../localRepository';
import { RetryQueue } from '../retryQueue';
import { DataError, type CreateSessionInput, type StoredHand } from '../types';

let clock = 0;
let ids = 0;
const repo = () =>
  new LocalRepository(
    new MemoryStore(),
    () => new Date(Date.UTC(2026, 10, 21, 10, 0, clock++)).toISOString(),
    () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
  );

const sessionInput = (over: Partial<CreateSessionInput> = {}): CreateSessionInput => ({
  id: '11111111-1111-4111-8111-111111111111',
  seed: 'seed',
  learningMode: false,
  smallBlind: 100,
  bigBlind: 200,
  rake: { percentBps: 1000, cap: 600, roundTo: 100, noFlopNoDrop: true },
  opponents: 3,
  botProfiles: ['tag', 'maniac', 'callingStation'],
  stopLoss: null,
  buyIn: 20000,
  ...over,
});

const hand = (id: string, handNumber: number, sessionId: string, playedAt: string, learningMode = false): StoredHand => ({
  id,
  sessionId,
  handNumber,
  playedAt,
  learningMode,
  smallBlind: 100,
  bigBlind: 200,
  numPlayers: 4,
  heroSeat: 0,
  buttonSeat: 0,
  heroPosition: 'BTN',
  heroHoleCards: 'AsKd',
  board: '',
  potTotal: 300,
  rake: 0,
  heroNet: 200,
  heroRakePaid: 0,
  heroVpip: true,
  heroPfr: true,
  heroSawFlop: false,
  wentToShowdown: false,
  heroWon: true,
  engineVersion: 1,
  events: [{ type: 'hand_completed', stacks: [], rake: 0 }],
});

const deposit = (r: LocalRepository, amount: number) =>
  r.addTransaction({ id: crypto.randomUUID(), type: 'deposit', amount, note: 'Starting bankroll' });

describe('LocalRepository', () => {
  it('refuses a buy-in larger than the bankroll, and deducts one that fits', async () => {
    const r = repo();
    await expect(r.createSession(sessionInput())).rejects.toMatchObject({ code: 'insufficient_bankroll' });
    await deposit(r, 50000);
    const s = await r.createSession(sessionInput());
    expect(s.totalBoughtIn).toBe(20000);
    expect((await r.getBankroll()).balance).toBe(30000);
    // Creating again with the same id is idempotent and charges nothing.
    await r.createSession(sessionInput());
    expect((await r.getBankroll()).balance).toBe(30000);
  });

  it('learning sessions never touch the bankroll', async () => {
    const r = repo();
    const s = await r.createSession(sessionInput({ learningMode: true }));
    await r.rebuy(s.id, 10000);
    await r.endSession(s.id, 5000);
    expect(await r.getBankroll()).toEqual({ balance: 0, transactions: [] });
  });

  it('rebuys charge the bankroll; ending credits the cash-out once', async () => {
    const r = repo();
    await deposit(r, 30000);
    const s = await r.createSession(sessionInput());
    await expect(r.rebuy(s.id, 20000)).rejects.toBeInstanceOf(DataError);
    const after = await r.rebuy(s.id, 10000);
    expect(after.totalBoughtIn).toBe(30000);
    expect((await r.getBankroll()).balance).toBe(0);
    const ended = await r.endSession(s.id, 45000);
    expect(ended.cashedOut).toBe(45000);
    await r.endSession(s.id, 99999); // idempotent
    const { balance, transactions } = await r.getBankroll();
    expect(balance).toBe(45000);
    expect(transactions.map((t) => [t.type, t.amount])).toEqual([
      ['deposit', 30000],
      ['buy_in', -20000],
      ['buy_in', -10000],
      ['cash_out', 45000],
    ]);
    await expect(r.rebuy(s.id, 100)).rejects.toMatchObject({ code: 'session_ended' });
  });

  it('withdrawals cannot exceed the balance and are stored negative', async () => {
    const r = repo();
    await deposit(r, 1000);
    await expect(r.addTransaction({ id: crypto.randomUUID(), type: 'withdrawal', amount: 1001 })).rejects.toMatchObject({
      code: 'insufficient_bankroll',
    });
    const { balance, transaction } = await r.addTransaction({ id: crypto.randomUUID(), type: 'withdrawal', amount: 400 });
    expect(balance).toBe(600);
    expect(transaction.amount).toBe(-400);
  });

  it('saves hands idempotently, counts them on the session, and lists them in order', async () => {
    const r = repo();
    const s = await r.createSession(sessionInput({ learningMode: true }));
    const other = '33333333-3333-4333-8333-333333333333';
    await r.saveHand(hand('a', 1, s.id, '2026-11-21T10:00:01.000Z'));
    await r.saveHand(hand('b', 2, s.id, '2026-11-21T10:00:02.000Z', true));
    await r.saveHand(hand('b', 2, s.id, '2026-11-21T10:00:02.000Z', true)); // duplicate
    await r.saveHand(hand('c', 1, other, '2026-11-21T10:00:03.000Z'));
    expect((await r.getSession(s.id))!.handsPlayed).toBe(2);
    expect((await r.listHands()).map((h) => h.id)).toEqual(['c', 'b', 'a']);
    expect((await r.listHands({ sessionId: s.id })).map((h) => h.id)).toEqual(['b', 'a']);
    expect((await r.listHands({ before: '2026-11-21T10:00:02.000Z' })).map((h) => h.id)).toEqual(['a']);
    expect((await r.handSummaries()).map((h) => h.id)).toEqual(['a', 'c']); // learning excluded, oldest first
    expect((await r.handSummaries({ includeLearning: true })).map((h) => h.id)).toEqual(['a', 'b', 'c']);
    const full = await r.getHand('a');
    expect(full!.events).toHaveLength(1);
    expect(await r.getHand('missing')).toBeNull();
  });

  it('settings default and merge patches', async () => {
    const r = repo();
    expect((await r.getSettings()).buyInRule).toBe(25);
    expect((await r.updateSettings({ buyInRule: 40 })).buyInRule).toBe(40);
    expect((await r.getSettings()).defaultOpponents).toBe(3);
  });
});

describe('Retry queue', () => {
  it('keeps order, de-duplicates, and stops flushing at the first failure', async () => {
    const q = new RetryQueue(new MemoryStore());
    const s = '11111111-1111-4111-8111-111111111111';
    q.enqueue(hand('a', 1, s, 't1'));
    q.enqueue(hand('b', 2, s, 't2'));
    q.enqueue(hand('a', 1, s, 't1'));
    q.enqueue(hand('c', 3, s, 't3'));
    expect(q.size()).toBe(3);

    const sent: string[] = [];
    const n = await q.flush(async (h) => {
      if (h.id === 'b' && sent.length === 1) throw new Error('offline');
      sent.push(h.id);
    });
    expect(n).toBe(1);
    expect(q.items().map((h) => h.id)).toEqual(['b', 'c']);

    expect(await q.flush(async (h) => void sent.push(h.id))).toBe(2);
    expect(sent).toEqual(['a', 'b', 'c']);
    expect(q.size()).toBe(0);
  });
});
