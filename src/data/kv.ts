/** The subset of Web Storage the data layer uses; injectable for tests. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const PREFIX = 'poker-sim:';

export function readJson<T>(store: KeyValueStore, key: string, fallback: T): T {
  try {
    const raw = store.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJson(store: KeyValueStore, key: string, value: unknown): void {
  store.setItem(PREFIX + key, JSON.stringify(value));
}

/** In-memory store, used in tests and when browser storage is unavailable. */
export class MemoryStore implements KeyValueStore {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

/** window.localStorage when usable, otherwise an in-memory fallback. */
export function browserStore(): KeyValueStore {
  try {
    const probe = `${PREFIX}probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return new MemoryStore();
  }
}

/**
 * A view of a store whose app keys live under a sub-prefix, e.g. guest data at
 * "poker-sim:guest:..." so it never mixes with the owner's local data.
 */
export class PrefixedStore implements KeyValueStore {
  constructor(
    private inner: KeyValueStore,
    private sub: string,
  ) {}
  private map(key: string) {
    return key.startsWith(PREFIX) ? `${PREFIX}${this.sub}${key.slice(PREFIX.length)}` : key;
  }
  getItem(key: string) {
    return this.inner.getItem(this.map(key));
  }
  setItem(key: string, value: string) {
    this.inner.setItem(this.map(key), value);
  }
  removeItem(key: string) {
    this.inner.removeItem(this.map(key));
  }
}
