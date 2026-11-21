import { json, protectedRoute } from '@/server/http';
import { handSummaries } from '@/server/service';

/** Every hand summary, oldest first, without event logs (feeds the stats). */
export const GET = protectedRoute(async (req, db) => {
  const includeLearning = new URL(req.url).searchParams.get('includeLearning') === 'true';
  return json({ hands: await handSummaries(db, includeLearning) });
});
