import { describe, expect, it } from 'vitest';
import { asc, eq, getTableColumns, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { PgDialect } from 'drizzle-orm/pg-core';
import * as schema from '@/db/schema';

/**
 * No database is reachable in tests (by design). These compile the service's
 * query shapes to SQL with drizzle's mock driver to catch mistakes early.
 */
const db = drizzle.mock({ schema });
const { bankrollTransactions, hands, sessions } = schema;

describe('SQL generation', () => {
  it('list queries select summary columns without the event log', () => {
    const { events: _e, ...summary } = getTableColumns(hands);
    const q = db.select(summary).from(hands).orderBy(asc(hands.playedAt)).toSQL();
    expect(q.sql).toContain('"hero_net"');
    expect(q.sql).not.toContain('"events"');
  });

  it('hand insert is idempotent by id', () => {
    const q = db
      .insert(hands)
      .values({
        id: '22222222-2222-4222-8222-222222222222',
        sessionId: '11111111-1111-4111-8111-111111111111',
        handNumber: 1,
        playedAt: new Date(0),
        learningMode: false,
        smallBlind: 100,
        bigBlind: 200,
        numPlayers: 4,
        heroSeat: 0,
        buttonSeat: 0,
        heroPosition: 'BTN',
        heroHoleCards: 'AsKd',
        board: '',
        potTotal: 0,
        rake: 0,
        heroNet: 0,
        heroRakePaid: 0,
        heroVpip: false,
        heroPfr: false,
        heroSawFlop: false,
        wentToShowdown: false,
        heroWon: false,
        events: [],
      })
      .onConflictDoNothing()
      .returning({ id: hands.id })
      .toSQL();
    expect(q.sql).toContain('on conflict do nothing');
  });

  it('balance and counters use SQL arithmetic', () => {
    const b = db.select({ total: sql`coalesce(sum(${bankrollTransactions.amount}), 0)` }).from(bankrollTransactions).toSQL();
    expect(b.sql).toBe('select coalesce(sum("amount"), 0) from "bankroll_transactions"');
    const u = db
      .update(sessions)
      .set({ handsPlayed: sql`${sessions.handsPlayed} + 1` })
      .where(eq(sessions.id, 'x'))
      .toSQL();
    expect(u.sql).toContain('"hands_played" = "sessions"."hands_played" + 1');
  });

  it('the cash-out insert is guarded against duplicates', () => {
    const q = new PgDialect().sqlToQuery(
      sql`insert into ${bankrollTransactions} (id, type, amount, session_id)
          select ${'id'}, 'cash_out', ${500}, ${'s'}
          where not exists (select 1 from ${bankrollTransactions} where session_id = ${'s'} and type = 'cash_out')`,
    );
    expect(q.sql).toContain('insert into "bankroll_transactions"');
    expect(q.sql).toContain('where not exists');
    expect(q.params).toEqual(['id', 500, 's', 's']);
  });
});
