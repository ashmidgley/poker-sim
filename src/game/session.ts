import { hashSeed, mulberry32, type RakeConfig } from '@/engine';
import { isArchetypeId, randomMix, type ArchetypeId } from '@/bots';

/** Everything needed to run a table session. Amounts are cents. */
export interface SessionConfig {
  id: string;
  seed: string;
  createdAt: string; // ISO
  opponents: number; // 1..8
  botProfiles: ArchetypeId[]; // index i is the bot in seat i + 1
  smallBlind: number;
  bigBlind: number;
  buyIn: number;
  rake: RakeConfig;
  learningMode: boolean;
}

const KEY = (id: string) => `poker-sim:session-config:${id}`;

/** A seeded random archetype mix for a session. */
export function seededMix(seed: string, count: number): ArchetypeId[] {
  return randomMix(count, mulberry32(hashSeed(`${seed}:bot-mix`)));
}

/** Fill in anything an older stored config lacks. */
export function normalizeConfig(raw: SessionConfig): SessionConfig {
  const valid =
    Array.isArray(raw.botProfiles) && raw.botProfiles.length === raw.opponents && raw.botProfiles.every(isArchetypeId);
  return valid ? raw : { ...raw, botProfiles: seededMix(raw.seed, raw.opponents) };
}

/**
 * Session configs live in localStorage so a refresh can find the table
 * again. Phase 4 moves this behind the Repository.
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
    return raw ? normalizeConfig(JSON.parse(raw) as SessionConfig) : null;
  } catch {
    return null;
  }
}

export function newId(): string {
  return crypto.randomUUID();
}
