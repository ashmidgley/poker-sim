import type { RakeConfig } from '@/engine';

/** Everything needed to run a table session. Amounts are cents. */
export interface SessionConfig {
  id: string;
  seed: string;
  createdAt: string; // ISO
  opponents: number; // 1..8
  smallBlind: number;
  bigBlind: number;
  buyIn: number;
  rake: RakeConfig;
  learningMode: boolean;
}

const KEY = (id: string) => `poker-sim:session-config:${id}`;

/**
 * Phase 2 keeps session configs in localStorage so a refresh can find the
 * table again. Phase 4 moves this behind the Repository.
 */
export function saveSessionConfig(config: SessionConfig): void {
  try {
    localStorage.setItem(KEY(config.id), JSON.stringify(config));
  } catch {
    // Storage unavailable (private mode, quota): the session still runs in memory.
  }
}

export function loadSessionConfig(id: string): SessionConfig | null {
  try {
    const raw = localStorage.getItem(KEY(id));
    return raw ? (JSON.parse(raw) as SessionConfig) : null;
  } catch {
    return null;
  }
}

export function newId(): string {
  return crypto.randomUUID();
}
