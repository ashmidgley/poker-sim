import { readJson, writeJson, type KeyValueStore } from './kv';
import type { Repository } from './repository';
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
} from './types';

const K = {
  settings: 'settings',
  sessions: 'sessions',
  transactions: 'transactions',
  summaries: 'hand-summaries',
  hand: (id: string) => `hand:${id}`,
};

/**
 * Repository backed by localStorage (PLAN 7.2). Applies the same rules as
 * the API: balance checks, idempotent hand saves and session ends. Hand event
 * logs are stored one key per hand; summaries in one list.
 */
export class LocalRepository implements Repository {
  readonly kind: 'local' | 'guest';
  /** Guests play without a bankroll: buy-ins are play money and nothing is written to a ledger. */
  private readonly trackBankroll: boolean;

  constructor(
    private store: KeyValueStore,
    private now: () => string = () => new Date().toISOString(),
    private newId: () => string = () => crypto.randomUUID(),
    opts: { guest?: boolean } = {},
  ) {
    this.kind = opts.guest ? 'guest' : 'local';
    this.trackBankroll = !opts.guest;
  }

  /** Whether a session's chips come from the bankroll ledger. */
  private usesLedger(learningMode: boolean): boolean {
    return this.trackBankroll && !learningMode;
  }

  private write(key: string, value: unknown) {
    try {
      writeJson(this.store, key, value);
    } catch {
      throw new DataError('server', 'Browser storage is full. Connect a database to keep more hands.');
    }
  }

  // ---------- settings ----------

  async getSettings(): Promise<Settings> {
    return { ...DEFAULT_SETTINGS, ...readJson<Partial<Settings>>(this.store, K.settings, {}) };
  }

  async updateSettings(patch: SettingsPatch): Promise<Settings> {
    const next = { ...(await this.getSettings()), ...patch };
    this.write(K.settings, next);
    return next;
  }

  // ---------- sessions ----------

  private sessions(): Session[] {
    return readJson<Session[]>(this.store, K.sessions, []);
  }

  private saveSession(session: Session) {
    const all = this.sessions().filter((s) => s.id !== session.id);
    this.write(K.sessions, [...all, session]);
  }

  async listSessions(limit = 50): Promise<Session[]> {
    return this.sessions()
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit);
  }

  async getSession(id: string): Promise<Session | null> {
    return this.sessions().find((s) => s.id === id) ?? null;
  }

  async createSession(input: CreateSessionInput): Promise<Session> {
    const existing = await this.getSession(input.id);
    if (existing) return existing; // idempotent
    if (this.usesLedger(input.learningMode) && input.buyIn > this.balance()) throw new DataError('insufficient_bankroll');
    const session: Session = {
      id: input.id,
      startedAt: this.now(),
      endedAt: null,
      seed: input.seed,
      learningMode: input.learningMode,
      smallBlind: input.smallBlind,
      bigBlind: input.bigBlind,
      rake: input.rake,
      opponents: input.opponents,
      botProfiles: input.botProfiles,
      stopLoss: input.stopLoss,
      totalBoughtIn: input.buyIn,
      cashedOut: null,
      handsPlayed: 0,
    };
    this.saveSession(session);
    if (this.usesLedger(input.learningMode)) this.addTx('buy_in', -input.buyIn, session.id, null);
    return session;
  }

  async rebuy(id: string, amount: number): Promise<Session> {
    const s = await this.getSession(id);
    if (!s) throw new DataError('not_found');
    if (s.endedAt) throw new DataError('session_ended');
    if (this.usesLedger(s.learningMode) && amount > this.balance()) throw new DataError('insufficient_bankroll');
    const next = { ...s, totalBoughtIn: s.totalBoughtIn + amount };
    this.saveSession(next);
    if (this.usesLedger(s.learningMode)) this.addTx('buy_in', -amount, id, 'Rebuy');
    return next;
  }

  async endSession(id: string, cashOut: number): Promise<Session> {
    const s = await this.getSession(id);
    if (!s) throw new DataError('not_found');
    if (s.endedAt) return s; // idempotent
    const next = { ...s, endedAt: this.now(), cashedOut: cashOut };
    this.saveSession(next);
    if (this.usesLedger(s.learningMode)) this.addTx('cash_out', cashOut, id, null);
    return next;
  }

  // ---------- hands ----------

  private summaries(): HandSummary[] {
    return readJson<HandSummary[]>(this.store, K.summaries, []);
  }

  async saveHand(hand: StoredHand): Promise<void> {
    const all = this.summaries();
    if (all.some((h) => h.id === hand.id)) return; // idempotent
    const { events, ...summary } = hand;
    this.write(K.hand(hand.id), events);
    try {
      this.write(K.summaries, [...all, summary]);
    } catch (e) {
      this.store.removeItem(K.hand(hand.id));
      throw e;
    }
    const s = await this.getSession(hand.sessionId);
    if (s) this.saveSession({ ...s, handsPlayed: s.handsPlayed + 1 });
  }

  async listHands(opts: { sessionId?: string; limit?: number; before?: string } = {}): Promise<HandSummary[]> {
    return this.summaries()
      .filter((h) => !opts.sessionId || h.sessionId === opts.sessionId)
      .filter((h) => !opts.before || h.playedAt < opts.before)
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt) || b.handNumber - a.handNumber)
      .slice(0, opts.limit ?? 100);
  }

  async handSummaries(opts: { includeLearning?: boolean } = {}): Promise<HandSummary[]> {
    return this.summaries()
      .filter((h) => opts.includeLearning || !h.learningMode)
      .sort((a, b) => a.playedAt.localeCompare(b.playedAt) || a.handNumber - b.handNumber);
  }

  async getHand(id: string): Promise<StoredHand | null> {
    const summary = this.summaries().find((h) => h.id === id);
    if (!summary) return null;
    return { ...summary, events: readJson(this.store, K.hand(id), []) };
  }

  // ---------- bankroll ----------

  private transactions(): Transaction[] {
    return readJson<Transaction[]>(this.store, K.transactions, []);
  }

  private balance(): number {
    return this.transactions().reduce((a, t) => a + t.amount, 0);
  }

  private addTx(type: Transaction['type'], amount: number, sessionId: string | null, note: string | null, id = this.newId()) {
    const tx: Transaction = { id, createdAt: this.now(), type, amount, sessionId, note };
    this.write(K.transactions, [...this.transactions(), tx]);
    return tx;
  }

  async getBankroll(): Promise<Bankroll> {
    const transactions = this.transactions();
    return { balance: transactions.reduce((a, t) => a + t.amount, 0), transactions };
  }

  async addTransaction(input: AddTransactionInput): Promise<{ balance: number; transaction: Transaction }> {
    if (!this.trackBankroll) throw new DataError('unauthorized', 'Guests play without a bankroll.');
    const existing = this.transactions().find((t) => t.id === input.id);
    if (existing) return { balance: this.balance(), transaction: existing }; // idempotent
    if (input.type === 'withdrawal' && input.amount > this.balance()) throw new DataError('insufficient_bankroll');
    const amount = input.type === 'withdrawal' ? -input.amount : input.amount;
    const transaction = this.addTx(input.type, amount, null, input.note ?? null, input.id);
    return { balance: this.balance(), transaction };
  }
}
