import type { Card } from '@/engine';
import { computeEquity, type EquityRequest, type EquityResponse } from './equityProtocol';

type Ok = Extract<EquityResponse, { ok: true }>;

/**
 * Typed client for the equity worker. Each request gets an id; when a newer
 * request has been sent by the time an answer arrives, the older answer
 * resolves to null so stale percentages never show. Create it in an effect
 * (never during server rendering) and terminate it on unmount. Falls back to
 * computing on the main thread if workers are unavailable.
 */
export class EquityClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private latestId = 0;
  private pending = new Map<number, (r: EquityResponse) => void>();

  constructor() {
    try {
      this.worker = new Worker(new URL('./equity.worker.ts', import.meta.url), { type: 'module' });
      this.worker.addEventListener('message', (e: MessageEvent<EquityResponse>) => {
        const resolve = this.pending.get(e.data.id);
        this.pending.delete(e.data.id);
        resolve?.(e.data);
      });
      this.worker.addEventListener('error', () => this.failAll('Equity worker crashed'));
    } catch {
      this.worker = null;
    }
  }

  get usingWorker(): boolean {
    return this.worker !== null;
  }

  async request(hands: [Card, Card][], board: Card[], seed: number): Promise<Ok | null> {
    const id = this.nextId++;
    this.latestId = id;
    const req: EquityRequest = { id, hands, board, seed };
    const res = await new Promise<EquityResponse>((resolve) => {
      if (this.worker) {
        this.pending.set(id, resolve);
        this.worker.postMessage(req);
      } else {
        setTimeout(() => resolve(computeEquity(req, () => performance.now())), 0);
      }
    });
    if (id !== this.latestId) return null; // superseded
    if (!res.ok) throw new Error(res.error);
    return res;
  }

  private failAll(error: string) {
    for (const [id, resolve] of this.pending) resolve({ id, ok: false, error });
    this.pending.clear();
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}
