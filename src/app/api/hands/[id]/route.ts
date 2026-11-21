import { DataError } from '@/data/types';
import { json, protectedRoute } from '@/server/http';
import { idParam, type IdContext } from '@/server/params';
import { getHand } from '@/server/service';

export const GET = protectedRoute<IdContext>(async (_req, db, ctx) => {
  const hand = await getHand(db, await idParam(ctx));
  if (!hand) throw new DataError('not_found');
  return json({ hand });
});
