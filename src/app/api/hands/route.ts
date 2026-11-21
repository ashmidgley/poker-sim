import { z } from 'zod';
import { DataError, saveHandSchema, type StoredHand } from '@/data/types';
import { json, protectedRoute, readBody } from '@/server/http';
import { intParam } from '@/server/params';
import { listHands, saveHand } from '@/server/service';

/** Idempotent by hand id (ON CONFLICT DO NOTHING); the session counter only moves on a new row. */
export const POST = protectedRoute(async (req, db) => {
  const { hand } = await readBody(req, saveHandSchema);
  await saveHand(db, hand as StoredHand);
  return json({ ok: true }, 201);
});

export const GET = protectedRoute(async (req, db) => {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get('sessionId') ?? undefined;
  const before = url.searchParams.get('before') ?? undefined;
  if (sessionId && !z.uuid().safeParse(sessionId).success) throw new DataError('invalid', 'sessionId must be a UUID');
  if (before && !z.iso.datetime({ offset: true }).safeParse(before).success) throw new DataError('invalid', 'before must be an ISO timestamp');
  return json({ hands: await listHands(db, { sessionId, before, limit: intParam(url, 'limit', 100, 1, 500) }) });
});
