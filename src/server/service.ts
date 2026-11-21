import 'server-only';
import { and, asc, desc, eq, getTableColumns, lt, sql, type SQL } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { bankrollTransactions, hands, sessions, settings } from '@/db/schema';
import {
  DataError,
  DEFAULT_SETTINGS,
  type AddTransactionInput,
  type Bankroll,
  type CreateSessionInput,
  type HandSummary,
  type Session,
  type Settings,
  type SettingsPatch,
  type StoredHand,
  type Transaction,
} from '@/data/types';

/**
 * Database operations behind the API routes. The Neon HTTP driver has no
 * interactive transactions, so multi-statement writes use db.batch (PLAN 6).
 * Single user: the balance check before a buy-in is not race-proof, which is
 * accepted.
 */

type SessionRow = typeof sessions.$inferSelect;
type HandRow = typeof hands.$inferSelect;
type TxRow = typeof bankrollTransactions.$inferSelect;
type SettingsRow = typeof settings.$inferSelect;

function toSession(r: SessionRow): Session {
  return {
    id: r.id,
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt?.toISOString() ?? null,
    seed: r.seed,
    learningMode: r.learningMode,
    smallBlind: r.smallBlind,
    bigBlind: r.bigBlind,
    rake: { percentBps: r.rakeBps, cap: r.rakeCap, roundTo: r.rakeRoundTo, noFlopNoDrop: r.noFlopNoDrop },
    opponents: r.opponents,
    botProfiles: r.botProfiles as Session['botProfiles'],
    stopLoss: r.stopLoss,
    totalBoughtIn: r.totalBoughtIn,
    cashedOut: r.cashedOut,
    handsPlayed: r.handsPlayed,
  };
}

function toSummary(r: Omit<HandRow, 'events'>): HandSummary {
  return {
    id: r.id,
    sessionId: r.sessionId,
    handNumber: r.handNumber,
    playedAt: r.playedAt.toISOString(),
    learningMode: r.learningMode,
    smallBlind: r.smallBlind,
    bigBlind: r.bigBlind,
    numPlayers: r.numPlayers,
    heroSeat: r.heroSeat,
    buttonSeat: r.buttonSeat,
    heroPosition: r.heroPosition as HandSummary['heroPosition'],
    heroHoleCards: r.heroHoleCards,
    board: r.board,
    potTotal: r.potTotal,
    rake: r.rake,
    heroNet: r.heroNet,
    heroRakePaid: r.heroRakePaid,
    heroVpip: r.heroVpip,
    heroPfr: r.heroPfr,
    heroSawFlop: r.heroSawFlop,
    wentToShowdown: r.wentToShowdown,
    heroWon: r.heroWon,
    engineVersion: r.engineVersion,
  };
}

function toTx(r: TxRow): Transaction {
  return {
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    type: r.type as Transaction['type'],
    amount: r.amount,
    sessionId: r.sessionId,
    note: r.note,
  };
}

function toSettings(r: SettingsRow): Settings {
  const { id: _id, updatedAt: _u, ...rest } = r;
  return { ...rest, rakePreset: rest.rakePreset as Settings['rakePreset'] };
}

// Summary columns only (no events), for list queries.
const { events: _events, ...summaryColumns } = getTableColumns(hands);

// ---------- settings ----------

export async function getSettings(db: Db): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  if (row) return toSettings(row);
  const [created] = await db.insert(settings).values({ id: 1 }).onConflictDoNothing().returning();
  if (created) return toSettings(created);
  const [again] = await db.select().from(settings).where(eq(settings.id, 1));
  return again ? toSettings(again) : DEFAULT_SETTINGS;
}

export async function updateSettings(db: Db, patch: SettingsPatch): Promise<Settings> {
  await getSettings(db); // ensure the row exists
  const [row] = await db
    .update(settings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(settings.id, 1))
    .returning();
  return toSettings(row);
}

// ---------- bankroll ----------

export async function balance(db: Db): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${bankrollTransactions.amount}), 0)` })
    .from(bankrollTransactions);
  return Number(row.total);
}

export async function getBankroll(db: Db): Promise<Bankroll> {
  const rows = await db.select().from(bankrollTransactions).orderBy(asc(bankrollTransactions.createdAt));
  const transactions = rows.map(toTx);
  return { balance: transactions.reduce((a, t) => a + t.amount, 0), transactions };
}

export async function addTransaction(db: Db, input: AddTransactionInput): Promise<{ balance: number; transaction: Transaction }> {
  const [existing] = await db.select().from(bankrollTransactions).where(eq(bankrollTransactions.id, input.id));
  if (existing) return { balance: await balance(db), transaction: toTx(existing) };
  if (input.type === 'withdrawal' && input.amount > (await balance(db))) throw new DataError('insufficient_bankroll');
  const [row] = await db
    .insert(bankrollTransactions)
    .values({
      id: input.id,
      type: input.type,
      amount: input.type === 'withdrawal' ? -input.amount : input.amount,
      note: input.note ?? null,
    })
    .onConflictDoNothing()
    .returning();
  const tx = row ?? (await db.select().from(bankrollTransactions).where(eq(bankrollTransactions.id, input.id)))[0];
  return { balance: await balance(db), transaction: toTx(tx) };
}

// ---------- sessions ----------

export async function listSessions(db: Db, limit: number): Promise<Session[]> {
  const rows = await db.select().from(sessions).orderBy(desc(sessions.startedAt)).limit(limit);
  return rows.map(toSession);
}

export async function getSession(db: Db, id: string): Promise<Session | null> {
  const [row] = await db.select().from(sessions).where(eq(sessions.id, id));
  return row ? toSession(row) : null;
}

export async function createSession(db: Db, input: CreateSessionInput): Promise<Session> {
  const existing = await getSession(db, input.id);
  if (existing) return existing; // idempotent retry
  if (!input.learningMode && input.buyIn > (await balance(db))) throw new DataError('insufficient_bankroll');

  const insertSession = db
    .insert(sessions)
    .values({
      id: input.id,
      seed: input.seed,
      learningMode: input.learningMode,
      smallBlind: input.smallBlind,
      bigBlind: input.bigBlind,
      rakeBps: input.rake.percentBps,
      rakeCap: input.rake.cap,
      rakeRoundTo: input.rake.roundTo,
      noFlopNoDrop: input.rake.noFlopNoDrop,
      opponents: input.opponents,
      botProfiles: input.botProfiles,
      stopLoss: input.stopLoss,
      totalBoughtIn: input.buyIn,
    })
    .returning();

  if (input.learningMode) {
    const [row] = await insertSession;
    return toSession(row);
  }
  const [[row]] = await db.batch([
    insertSession,
    db.insert(bankrollTransactions).values({
      id: crypto.randomUUID(),
      type: 'buy_in',
      amount: -input.buyIn,
      sessionId: input.id,
    }),
  ]);
  return toSession(row);
}

export async function rebuy(db: Db, id: string, amount: number): Promise<Session> {
  const s = await getSession(db, id);
  if (!s) throw new DataError('not_found');
  if (s.endedAt) throw new DataError('session_ended');
  const update = db
    .update(sessions)
    .set({ totalBoughtIn: sql`${sessions.totalBoughtIn} + ${amount}` })
    .where(eq(sessions.id, id))
    .returning();
  if (s.learningMode) {
    const [row] = await update;
    return toSession(row);
  }
  if (amount > (await balance(db))) throw new DataError('insufficient_bankroll');
  const [[row]] = await db.batch([
    update,
    db.insert(bankrollTransactions).values({ id: crypto.randomUUID(), type: 'buy_in', amount: -amount, sessionId: id, note: 'Rebuy' }),
  ]);
  return toSession(row);
}

export async function endSession(db: Db, id: string, cashOut: number): Promise<Session> {
  const s = await getSession(db, id);
  if (!s) throw new DataError('not_found');
  if (s.endedAt) return s; // idempotent
  const update = db
    .update(sessions)
    .set({ endedAt: new Date(), cashedOut: cashOut })
    .where(and(eq(sessions.id, id), sql`${sessions.endedAt} is null`))
    .returning();
  if (s.learningMode) {
    const [row] = await update;
    return row ? toSession(row) : ((await getSession(db, id)) as Session);
  }
  // Insert the cash-out only if this call is the one that ended the session.
  const [[row]] = await db.batch([
    update,
    db.execute(sql`
      insert into ${bankrollTransactions} (id, type, amount, session_id)
      select ${crypto.randomUUID()}, 'cash_out', ${cashOut}, ${id}
      where not exists (
        select 1 from ${bankrollTransactions} where session_id = ${id} and type = 'cash_out'
      )`),
  ]);
  return row ? toSession(row) : ((await getSession(db, id)) as Session);
}

// ---------- hands ----------

export async function saveHand(db: Db, hand: StoredHand): Promise<void> {
  const session = await getSession(db, hand.sessionId);
  if (!session) throw new DataError('not_found', 'Unknown session');
  const inserted = await db
    .insert(hands)
    .values({ ...hand, playedAt: new Date(hand.playedAt), events: hand.events })
    .onConflictDoNothing()
    .returning({ id: hands.id });
  if (inserted.length > 0) {
    await db
      .update(sessions)
      .set({ handsPlayed: sql`${sessions.handsPlayed} + 1` })
      .where(eq(sessions.id, hand.sessionId));
  }
}

export async function listHands(
  db: Db,
  opts: { sessionId?: string; limit: number; before?: string },
): Promise<HandSummary[]> {
  const where: SQL[] = [];
  if (opts.sessionId) where.push(eq(hands.sessionId, opts.sessionId));
  if (opts.before) where.push(lt(hands.playedAt, new Date(opts.before)));
  const rows = await db
    .select(summaryColumns)
    .from(hands)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(hands.playedAt), desc(hands.handNumber))
    .limit(opts.limit);
  return rows.map(toSummary);
}

export async function handSummaries(db: Db, includeLearning: boolean): Promise<HandSummary[]> {
  const rows = await db
    .select(summaryColumns)
    .from(hands)
    .where(includeLearning ? undefined : eq(hands.learningMode, false))
    .orderBy(asc(hands.playedAt), asc(hands.handNumber));
  return rows.map(toSummary);
}

export async function getHand(db: Db, id: string): Promise<StoredHand | null> {
  const [row] = await db.select().from(hands).where(eq(hands.id, id));
  if (!row) return null;
  const { events, ...summary } = row;
  return { ...toSummary(summary), events: events as StoredHand['events'] };
}
