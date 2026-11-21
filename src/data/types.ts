import { z } from 'zod';

/**
 * Shapes shared by the API, HttpRepository and LocalRepository.
 * All money is integer cents; timestamps are ISO strings.
 * The zod schemas validate request bodies on the server (PLAN 7).
 */

const cents = z.number().int().min(0).max(1_000_000_000);
const signedCents = z.number().int().min(-1_000_000_000).max(1_000_000_000);
const archetype = z.enum(['tag', 'loosePassive', 'callingStation', 'maniac']);

export const rakeConfigSchema = z.strictObject({
  percentBps: z.number().int().min(0).max(10000),
  cap: cents,
  roundTo: z.number().int().min(1).max(100_000),
  noFlopNoDrop: z.boolean(),
});

// ---------- settings ----------

export const settingsSchema = z.strictObject({
  buyInRule: z.number().int().min(1).max(1000),
  defaultOpponents: z.number().int().min(1).max(8),
  defaultSmallBlind: cents.min(1),
  defaultBigBlind: cents.min(1),
  defaultBuyInBb: z.number().int().min(40).max(200),
  rakePreset: z.enum(['live', 'online', 'none', 'custom']),
  rakeBps: z.number().int().min(0).max(10000),
  rakeCap: cents,
  rakeRoundTo: z.number().int().min(1).max(100_000),
  noFlopNoDrop: z.boolean(),
  stopLossBuyIns: z.number().int().min(1).max(100).nullable(),
  autoSkipWhenFolded: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;
export const settingsPatchSchema = settingsSchema.partial();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export const DEFAULT_SETTINGS: Settings = {
  buyInRule: 25,
  defaultOpponents: 3,
  defaultSmallBlind: 100,
  defaultBigBlind: 200,
  defaultBuyInBb: 100,
  rakePreset: 'live',
  rakeBps: 1000,
  rakeCap: 600,
  rakeRoundTo: 100,
  noFlopNoDrop: true,
  stopLossBuyIns: null,
  autoSkipWhenFolded: false,
};

// ---------- sessions ----------

export const createSessionSchema = z.strictObject({
  id: z.uuid(),
  seed: z.string().min(1).max(200),
  learningMode: z.boolean(),
  smallBlind: cents.min(1),
  bigBlind: cents.min(1),
  rake: rakeConfigSchema,
  opponents: z.number().int().min(1).max(8),
  botProfiles: z.array(archetype).min(1).max(8),
  stopLoss: cents.nullable(),
  buyIn: cents.min(1),
});
export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export interface Session {
  id: string;
  startedAt: string;
  endedAt: string | null;
  seed: string;
  learningMode: boolean;
  smallBlind: number;
  bigBlind: number;
  rake: z.infer<typeof rakeConfigSchema>;
  opponents: number;
  botProfiles: z.infer<typeof archetype>[];
  stopLoss: number | null;
  totalBoughtIn: number;
  cashedOut: number | null;
  handsPlayed: number;
}

export const rebuySchema = z.strictObject({ amount: cents.min(1) });
export const endSessionSchema = z.strictObject({ cashOut: cents });

// ---------- hands ----------

export const POSITIONS = ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'] as const;

export const handSummarySchema = z.strictObject({
  id: z.uuid(),
  sessionId: z.uuid(),
  handNumber: z.number().int().min(1),
  playedAt: z.iso.datetime({ offset: true }),
  learningMode: z.boolean(),
  smallBlind: cents.min(1),
  bigBlind: cents.min(1),
  numPlayers: z.number().int().min(2).max(9),
  heroSeat: z.number().int().min(0).max(8),
  buttonSeat: z.number().int().min(0).max(8),
  heroPosition: z.enum(POSITIONS),
  heroHoleCards: z.string().regex(/^([2-9TJQKA][cdhs]){2}$/),
  board: z.string().regex(/^([2-9TJQKA][cdhs]){0,5}$/),
  potTotal: cents,
  rake: cents,
  heroNet: signedCents,
  heroRakePaid: cents,
  heroVpip: z.boolean(),
  heroPfr: z.boolean(),
  heroSawFlop: z.boolean(),
  wentToShowdown: z.boolean(),
  heroWon: z.boolean(),
  engineVersion: z.number().int().min(1),
});
export type HandSummary = z.infer<typeof handSummarySchema>;

/** Events are validated for shape only; the client is the engine of record. */
const eventSchema = z.looseObject({ type: z.string().min(1).max(40) });

export const storedHandSchema = handSummarySchema.extend({
  events: z.array(eventSchema).min(1).max(1000),
});
export const saveHandSchema = z.strictObject({ hand: storedHandSchema });

/** A hand as stored: the summary plus the full event log (HandEvent[]). */
export type StoredHand = HandSummary & { events: import('@/engine').HandEvent[] };

// ---------- bankroll ----------

export type TransactionType = 'deposit' | 'withdrawal' | 'buy_in' | 'cash_out';

export interface Transaction {
  id: string;
  createdAt: string;
  type: TransactionType;
  amount: number; // signed: buy_in and withdrawal negative
  sessionId: string | null;
  note: string | null;
}

export const addTransactionSchema = z.strictObject({
  id: z.uuid(),
  type: z.enum(['deposit', 'withdrawal']),
  amount: cents.min(1), // always positive; withdrawals are stored negative
  note: z.string().max(200).optional(),
});
export type AddTransactionInput = z.infer<typeof addTransactionSchema>;

export interface Bankroll {
  balance: number;
  transactions: Transaction[]; // oldest first
}

// ---------- errors ----------

export type DataErrorCode =
  | 'insufficient_bankroll'
  | 'unauthorized'
  | 'not_found'
  | 'no_database'
  | 'invalid'
  | 'session_ended'
  | 'network'
  | 'server';

export class DataError extends Error {
  constructor(
    public code: DataErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'DataError';
  }
}
