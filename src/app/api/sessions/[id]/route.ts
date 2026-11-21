import { DataError } from '@/data/types';
import { json, protectedRoute } from '@/server/http';
import { idParam, type IdContext } from '@/server/params';
import { getSession } from '@/server/service';

export const GET = protectedRoute<IdContext>(async (_req, db, ctx) => {
  const session = await getSession(db, await idParam(ctx));
  if (!session) throw new DataError('not_found');
  return json({ session });
});
