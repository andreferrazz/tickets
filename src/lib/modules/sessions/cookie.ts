import { dev } from '$app/environment';
import type { CookieSerializeOptions } from 'cookie';

/**
 * Carries the session token so server-side loads can identify the caller. The
 * same token also lives in localStorage, a leftover of the Phoenix client that
 * sent it as `Authorization: Bearer`. Nothing reads it for that any more, but a
 * browser signed in before the cutover (2026-10-07) holds only that copy and
 * gets its cookie from it (`restoreSessionCookie`). Once those 30-day sessions
 * have expired, localStorage can go and this cookie becomes the only copy.
 */
export const SESSION_COOKIE = 'tickets_session';

// Matches the lifetime of a `sessions` row (30 days since Phoenix), so the cookie
// and the sessions row stop being valid at roughly the same time.
const SESSION_TTL_DAYS = 30;

export const SESSION_COOKIE_OPTIONS: CookieSerializeOptions & { path: string } = {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: !dev,
    maxAge: SESSION_TTL_DAYS * 86_400
};
