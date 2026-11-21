import { hashSeed, mulberry32, type RakeConfig } from '@/engine';
import { randomMix, type ArchetypeId } from '@/bots';
import type { Session } from '@/data/types';

/** Everything needed to run a table session. Amounts are cents. */
export interface SessionConfig {
  id: string;
  seed: string;
  createdAt: string; // ISO
  opponents: number; // 1..8
  botProfiles: ArchetypeId[]; // index i is the bot in seat i + 1
  smallBlind: number;
  bigBlind: number;
  buyIn: number; // the hero's starting stack for a session with no saved state
  rake: RakeConfig;
  learningMode: boolean;
}

/** A seeded random archetype mix for a session. */
export function seededMix(seed: string, count: number): ArchetypeId[] {
  return randomMix(count, mulberry32(hashSeed(`${seed}:bot-mix`)));
}

/**
 * The table config for a stored session. With no hands and no saved table
 * state, everything bought in so far (initial buy-in plus any top-ups) is the
 * hero's stack.
 */
export function sessionToConfig(session: Session): SessionConfig {
  return {
    id: session.id,
    seed: session.seed,
    createdAt: session.startedAt,
    opponents: session.opponents,
    botProfiles: session.botProfiles,
    smallBlind: session.smallBlind,
    bigBlind: session.bigBlind,
    buyIn: session.totalBoughtIn,
    rake: session.rake,
    learningMode: session.learningMode,
  };
}

export function newId(): string {
  return crypto.randomUUID();
}
