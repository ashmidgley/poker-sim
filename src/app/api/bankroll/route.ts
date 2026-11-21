import { json, protectedRoute } from '@/server/http';
import { getBankroll } from '@/server/service';

export const GET = protectedRoute(async (_req, db) => json(await getBankroll(db)));
