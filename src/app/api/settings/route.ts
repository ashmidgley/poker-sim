import { settingsPatchSchema } from '@/data/types';
import { json, protectedRoute, readBody } from '@/server/http';
import { getSettings, updateSettings } from '@/server/service';

export const GET = protectedRoute(async (_req, db) => json(await getSettings(db)));

export const PUT = protectedRoute(async (req, db) => json(await updateSettings(db, await readBody(req, settingsPatchSchema))));
