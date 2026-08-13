import { dev } from '$app/environment';
import type { CookieSerializeOptions } from 'cookie';

/**
 * Carries the Phoenix session token so server-side loads can identify the
 * caller. The same token also lives in localStorage, because `lib/api.ts` still
 * needs to read it to set `Authorization: Bearer` on every endpoint Phoenix
 * continues to serve. Once nothing calls Phoenix from the browser, localStorage
 * can go and this cookie becomes the only copy.
 */
export const SESSION_COOKIE = 'tickets_session';

// Matches @session_ttl_days in backend/lib/backend/accounts.ex, so the cookie
// and the sessions row stop being valid at roughly the same time.
const SESSION_TTL_DAYS = 30;

export const SESSION_COOKIE_OPTIONS: CookieSerializeOptions & { path: string } = {
	httpOnly: true,
	sameSite: 'lax',
	path: '/',
	secure: !dev,
	maxAge: SESSION_TTL_DAYS * 86_400
};
