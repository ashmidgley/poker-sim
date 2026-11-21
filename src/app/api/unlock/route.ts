import { connection } from 'next/server';
import { authCookieHeader, authEnv, safeEqual } from '@/server/auth';
import { json } from '@/server/http';

const FAILURE_DELAY_MS = 600;

/** Public. Exchanges the passphrase (x-passphrase header) for an httpOnly session cookie. */
export async function POST(request: Request) {
  await connection();
  const env = authEnv();
  if (!env.passphrase) {
    return env.production ? json({ error: 'passphrase_not_configured' }, 500) : json({ ok: true });
  }
  const given = request.headers.get('x-passphrase') ?? '';
  if (!safeEqual(given, env.passphrase)) {
    // Slow down guessing a little.
    await new Promise((r) => setTimeout(r, FAILURE_DELAY_MS));
    return json({ error: 'unauthorized' }, 401);
  }
  return json({ ok: true }, 200, { 'Set-Cookie': authCookieHeader(env.passphrase, env.production) });
}
