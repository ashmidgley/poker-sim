import type { Repository } from './repository';
import type { RetryQueue } from './retryQueue';
import {
  DataError,
  type AddTransactionInput,
  type Bankroll,
  type CreateSessionInput,
  type DataErrorCode,
  type HandSummary,
  type Session,
  type Settings,
  type SettingsPatch,
  type StoredHand,
  type Transaction,
} from './types';

const KNOWN: DataErrorCode[] = ['insufficient_bankroll', 'unauthorized', 'not_found', 'no_database', 'invalid', 'session_ended', 'server'];

/** Repository over the app's own API (PLAN 7). Auth travels in the httpOnly cookie. */
export class HttpRepository implements Repository {
  readonly kind = 'http' as const;

  constructor(
    private queue: RetryQueue,
    private fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.fetcher(path, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new DataError('network', 'Could not reach the server');
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!res.ok) {
      const code = KNOWN.includes(data.error as DataErrorCode) ? (data.error as DataErrorCode) : 'server';
      throw new DataError(code, data.message);
    }
    return data as T;
  }

  async getSettings(): Promise<Settings> {
    return this.call('GET', '/api/settings');
  }
  async updateSettings(patch: SettingsPatch): Promise<Settings> {
    return this.call('PUT', '/api/settings', patch);
  }

  async listSessions(limit = 50): Promise<Session[]> {
    return (await this.call<{ sessions: Session[] }>('GET', `/api/sessions?limit=${limit}`)).sessions;
  }
  async createSession(input: CreateSessionInput): Promise<Session> {
    return (await this.call<{ session: Session }>('POST', '/api/sessions', input)).session;
  }
  async getSession(id: string): Promise<Session | null> {
    try {
      return (await this.call<{ session: Session }>('GET', `/api/sessions/${id}`)).session;
    } catch (e) {
      if (e instanceof DataError && e.code === 'not_found') return null;
      throw e;
    }
  }
  async rebuy(id: string, amount: number): Promise<Session> {
    return (await this.call<{ session: Session }>('POST', `/api/sessions/${id}/rebuy`, { amount })).session;
  }
  async endSession(id: string, cashOut: number): Promise<Session> {
    return (await this.call<{ session: Session }>('POST', `/api/sessions/${id}/end`, { cashOut })).session;
  }

  private postHand = (hand: StoredHand) => this.call<{ ok: true }>('POST', '/api/hands', { hand }).then(() => undefined);

  /**
   * Flush older queued hands first, then save this one. A failure that a
   * retry could fix (network, 5xx) queues the hand and resolves; a rejection
   * the retry cannot fix (invalid, unauthorized) rejects.
   */
  async saveHand(hand: StoredHand): Promise<void> {
    await this.queue.flush(this.postHand);
    if (this.queue.size() > 0) {
      this.queue.enqueue(hand); // keep order behind hands still waiting
      return;
    }
    try {
      await this.postHand(hand);
    } catch (e) {
      if (e instanceof DataError && (e.code === 'invalid' || e.code === 'unauthorized')) throw e;
      this.queue.enqueue(hand);
    }
  }

  flushQueue(): Promise<number> {
    return this.queue.flush(this.postHand);
  }

  async listHands(opts: { sessionId?: string; limit?: number; before?: string } = {}): Promise<HandSummary[]> {
    const q = new URLSearchParams();
    if (opts.sessionId) q.set('sessionId', opts.sessionId);
    if (opts.limit) q.set('limit', String(opts.limit));
    if (opts.before) q.set('before', opts.before);
    return (await this.call<{ hands: HandSummary[] }>('GET', `/api/hands?${q}`)).hands;
  }
  async handSummaries(opts: { includeLearning?: boolean } = {}): Promise<HandSummary[]> {
    return (await this.call<{ hands: HandSummary[] }>('GET', `/api/hands/summaries?includeLearning=${!!opts.includeLearning}`)).hands;
  }
  async getHand(id: string): Promise<StoredHand | null> {
    try {
      return (await this.call<{ hand: StoredHand }>('GET', `/api/hands/${id}`)).hand;
    } catch (e) {
      if (e instanceof DataError && e.code === 'not_found') return null;
      throw e;
    }
  }

  async getBankroll(): Promise<Bankroll> {
    return this.call('GET', '/api/bankroll');
  }
  async addTransaction(input: AddTransactionInput): Promise<{ balance: number; transaction: Transaction }> {
    return this.call('POST', '/api/bankroll/transactions', input);
  }
}
