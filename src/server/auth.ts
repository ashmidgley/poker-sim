import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** PLAN 7.1. The passphrase is never sent to the client or logged. */

export const AUTH_COOKIE = 'ps_auth';
export const AUTH_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface AuthEnv {
  passphrase: string | undefined;
  production: boolean;
}

export function authEnv(): AuthEnv {
  return { passphrase: process.env.APP_PASSPHRASE || undefined, production: process.env.NODE_ENV === 'production' };
}

/** Session token: HMAC-SHA256(key = passphrase, "poker-sim-session") as hex. */
export function sessionToken(passphrase: string): string {
  return createHmac('sha256', passphrase).update('poker-sim-session').digest('hex');
}

/** Constant-time comparison of two strings of any length (hash both, compare digests). */
export function safeEqual(a: string, b: string): boolean {
  const da = createHash('sha256').update(a).digest();
  const db = createHash('sha256').update(b).digest();
  return timingSafeEqual(da, db);
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export type AuthResult = { ok: true } | { ok: false; status: 401 | 500; error: 'unauthorized' | 'passphrase_not_configured' };

/** Passes with the auth cookie or an x-passphrase header. Unset passphrase: skipped in development, 500 in production. */
export function checkAuth(request: Request, env: AuthEnv = authEnv()): AuthResult {
  if (!env.passphrase) {
    return env.production ? { ok: false, status: 500, error: 'passphrase_not_configured' } : { ok: true };
  }
  const cookie = readCookie(request, AUTH_COOKIE);
  if (cookie !== null && safeEqual(cookie, sessionToken(env.passphrase))) return { ok: true };
  const header = request.headers.get('x-passphrase');
  if (header !== null && safeEqual(header, env.passphrase)) return { ok: true };
  return { ok: false, status: 401, error: 'unauthorized' };
}

export function authRequired(env: AuthEnv = authEnv()): boolean {
  return !!env.passphrase || env.production;
}

export function isUnlocked(request: Request, env: AuthEnv = authEnv()): boolean {
  return checkAuth(request, env).ok;
}

export function authCookieHeader(passphrase: string, production: boolean): string {
  return [
    `${AUTH_COOKIE}=${sessionToken(passphrase)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${AUTH_MAX_AGE_SECONDS}`,
    production ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

export function clearAuthCookieHeader(production: boolean): string {
  return [`${AUTH_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0', production ? 'Secure' : '']
    .filter(Boolean)
    .join('; ');
}
