import 'server-only';
import { connection } from 'next/server';
import type { z } from 'zod';
import { getDb, type Db } from '@/db/client';
import { DataError, type DataErrorCode } from '@/data/types';
import { checkAuth } from './auth';

const STATUS: Record<DataErrorCode, number> = {
  insufficient_bankroll: 409,
  session_ended: 409,
  not_found: 404,
  invalid: 400,
  unauthorized: 401,
  no_database: 503,
  network: 502,
  server: 500,
};

export function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

/** Parse and validate a JSON body; throws DataError('invalid'). */
export async function readBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new DataError('invalid', 'Body must be JSON');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new DataError('invalid', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return parsed.data;
}

/**
 * Every protected route: wait for a real request (never prerendered, since
 * Cache Components would otherwise prerender a GET at build time), check
 * auth, require the database, and map errors to JSON responses.
 */
export function protectedRoute<Ctx>(handler: (request: Request, db: Db, ctx: Ctx) => Promise<Response>) {
  return async (request: Request, ctx: Ctx): Promise<Response> => {
    await connection();
    const auth = checkAuth(request);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    const db = getDb();
    if (!db) return json({ error: 'no_database' }, 503);
    try {
      return await handler(request, db, ctx);
    } catch (e) {
      if (e instanceof DataError) return json({ error: e.code, message: e.message }, STATUS[e.code]);
      console.error('[api]', request.method, new URL(request.url).pathname, e);
      return json({ error: 'server' }, 500);
    }
  };
}
