import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit does not read .env.local itself; load it the way `next dev` would.
// Values already in the environment win (process.loadEnvFile does not overwrite).
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

/**
 * `pnpm db:generate` writes SQL migrations to ./drizzle and needs no database.
 * `pnpm db:migrate` applies them to DATABASE_URL: run it yourself, against the
 * database you intend (check which one `DATABASE_URL` points at first).
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
