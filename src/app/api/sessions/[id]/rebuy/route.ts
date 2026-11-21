import { rebuySchema } from '@/data/types';
import { json, protectedRoute, readBody } from '@/server/http';
import { idParam, type IdContext } from '@/server/params';
import { rebuy } from '@/server/service';

export const POST = protectedRoute<IdContext>(async (req, db, ctx) => {
  const id = await idParam(ctx);
  const { amount } = await readBody(req, rebuySchema);
  return json({ session: await rebuy(db, id, amount) });
});
