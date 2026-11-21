import 'server-only';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export type Db = NeonHttpDatabase<typeof schema>;

let cached: Db | null | undefined;

/** The database, or null when DATABASE_URL is unset (the app then runs on localStorage). */
export function getDb(): Db | null {
  if (cached !== undefined) return cached;
  const url = process.env.DATABASE_URL;
  cached = url ? drizzle(url, { schema }) : null;
  return cached;
}

export { schema };
