import { defineConfig } from 'drizzle-kit';

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
