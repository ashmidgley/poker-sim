import type {
  AddTransactionInput,
  Bankroll,
  CreateSessionInput,
  HandSummary,
  Session,
  Settings,
  SettingsPatch,
  StoredHand,
  Transaction,
} from './types';

/**
 * One method per API route (PLAN 7.2). HttpRepository calls the API;
 * LocalRepository applies the same rules against localStorage.
 * Methods reject with DataError.
 */
export interface Repository {
  /** http: the API; local: this browser (no database); guest: this browser, play money only. */
  readonly kind: 'http' | 'local' | 'guest';

  getSettings(): Promise<Settings>;
  updateSettings(patch: SettingsPatch): Promise<Settings>;

  listSessions(limit?: number): Promise<Session[]>; // newest first
  createSession(input: CreateSessionInput): Promise<Session>; // 'insufficient_bankroll' when buy-in > balance
  getSession(id: string): Promise<Session | null>;
  rebuy(id: string, amount: number): Promise<Session>;
  endSession(id: string, cashOut: number): Promise<Session>; // idempotent

  /** Idempotent by hand id. HttpRepository queues failed saves for retry instead of rejecting. */
  saveHand(hand: StoredHand): Promise<void>;
  listHands(opts?: { sessionId?: string; limit?: number; before?: string }): Promise<HandSummary[]>; // newest first
  handSummaries(opts?: { includeLearning?: boolean }): Promise<HandSummary[]>; // oldest first
  getHand(id: string): Promise<StoredHand | null>;

  getBankroll(): Promise<Bankroll>;
  addTransaction(input: AddTransactionInput): Promise<{ balance: number; transaction: Transaction }>;
}
