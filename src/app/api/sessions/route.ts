import { createSessionSchema } from '@/data/types';
import { json, protectedRoute, readBody } from '@/server/http';
import { intParam } from '@/server/params';
import { createSession, listSessions } from '@/server/service';

export const GET = protectedRoute(async (req, db) =>
  json({ sessions: await listSessions(db, intParam(new URL(req.url), 'limit', 50, 1, 500)) }),
);

export const POST = protectedRoute(async (req, db) =>
  json({ session: await createSession(db, await readBody(req, createSessionSchema)) }, 201),
);
