export type Rng = () => number;

/** mulberry32: small, fast, seedable PRNG returning values in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit hash, so seeds can be strings. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type SeedStream = 'deck' | 'bots' | 'equity' | 'button';

export function deriveSeed(sessionSeed: string, handNumber: number, stream: SeedStream): number {
  return hashSeed(`${sessionSeed}:${handNumber}:${stream}`);
}

export function streamRng(sessionSeed: string, handNumber: number, stream: SeedStream): Rng {
  return mulberry32(deriveSeed(sessionSeed, handNumber, stream));
}

/** Integer in [0, n). */
export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}
