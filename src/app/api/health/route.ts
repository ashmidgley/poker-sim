import { connection } from 'next/server';
import { getDb } from '@/db/client';
import { authRequired, isUnlocked } from '@/server/auth';
import { json } from '@/server/http';

/** Public. Tells the client which repository to use and whether to show the unlock screen. */
export async function GET(request: Request) {
  await connection();
  return json(
    { db: getDb() !== null, authRequired: authRequired(), unlocked: isUnlocked(request) },
    200,
    { 'Cache-Control': 'no-store' },
  );
}
