import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { AUTH_COOKIE, authCookieHeader, authRequired, checkAuth, safeEqual, sessionToken } = await import('../auth');

const req = (headers: Record<string, string> = {}) => new Request('http://localhost/api/settings', { headers });
const prod = { passphrase: 'correct horse', production: true };

describe('Auth', () => {
  it('rejects requests with no credentials', () => {
    expect(checkAuth(req(), prod)).toEqual({ ok: false, status: 401, error: 'unauthorized' });
  });

  it('accepts the right x-passphrase header and rejects a wrong one', () => {
    expect(checkAuth(req({ 'x-passphrase': 'correct horse' }), prod)).toEqual({ ok: true });
    expect(checkAuth(req({ 'x-passphrase': 'correct hors' }), prod).ok).toBe(false);
    expect(checkAuth(req({ 'x-passphrase': '' }), prod).ok).toBe(false);
  });

  it('accepts the session cookie, which is an HMAC and not the passphrase', () => {
    const token = sessionToken('correct horse');
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(token).not.toContain('correct');
    expect(checkAuth(req({ cookie: `other=1; ${AUTH_COOKIE}=${token}` }), prod)).toEqual({ ok: true });
    expect(checkAuth(req({ cookie: `${AUTH_COOKIE}=correct horse` }), prod).ok).toBe(false);
    // A token made with another passphrase does not work.
    expect(checkAuth(req({ cookie: `${AUTH_COOKIE}=${sessionToken('other')}` }), prod).ok).toBe(false);
  });

  it('with no passphrase: open in development, 500 in production', () => {
    expect(checkAuth(req(), { passphrase: undefined, production: false })).toEqual({ ok: true });
    expect(checkAuth(req(), { passphrase: undefined, production: true })).toEqual({
      ok: false,
      status: 500,
      error: 'passphrase_not_configured',
    });
    expect(authRequired({ passphrase: undefined, production: false })).toBe(false);
    expect(authRequired({ passphrase: undefined, production: true })).toBe(true);
  });

  it('sets an httpOnly, SameSite=Lax cookie, Secure in production', () => {
    const header = authCookieHeader('correct horse', true);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Secure');
    expect(header).not.toContain('correct horse');
    expect(authCookieHeader('x', false)).not.toContain('Secure');
  });

  it('compares strings of different lengths safely', () => {
    expect(safeEqual('a', 'a')).toBe(true);
    expect(safeEqual('a', 'ab')).toBe(false);
  });
});
