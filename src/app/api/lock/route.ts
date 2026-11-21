import { connection } from 'next/server';
import { authEnv, checkAuth, clearAuthCookieHeader } from '@/server/auth';
import { json } from '@/server/http';

/** Clears the session cookie. */
export async function POST(request: Request) {
  await connection();
  const auth = checkAuth(request);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  return json({ ok: true }, 200, { 'Set-Cookie': clearAuthCookieHeader(authEnv().production) });
}
