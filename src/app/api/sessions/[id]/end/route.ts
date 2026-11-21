import { endSessionSchema } from '@/data/types';
import { json, protectedRoute, readBody } from '@/server/http';
import { idParam, type IdContext } from '@/server/params';
import { endSession } from '@/server/service';

/** Idempotent: ending an ended session returns it unchanged. */
export const POST = protectedRoute<IdContext>(async (req, db, ctx) => {
  const id = await idParam(ctx);
  const { cashOut } = await readBody(req, endSessionSchema);
  return json({ session: await endSession(db, id, cashOut) });
});
