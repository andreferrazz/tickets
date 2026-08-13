import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '$lib/modules/sessions/cookie';
import { error, json, type RequestHandler } from '@sveltejs/kit';

/**
 * Mirrors the client's session token into an httpOnly cookie so server loads can
 * see it — the browser cannot set httpOnly cookies itself, and the token is
 * issued by Phoenix, not by this app.
 *
 * Planting a token here grants nothing on its own: it only resolves to a user if
 * a matching row exists in `sessions`. SvelteKit's origin check keeps other
 * sites from posting one on a visitor's behalf.
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
	const { token } = (await request.json()) as { token?: unknown };
	if (typeof token !== 'string' || token === '') {
		error(422, `expected body { token: string }, got token: ${JSON.stringify(token)}`);
	}
	cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
	return json({ stored: true });
};

export const DELETE: RequestHandler = ({ cookies }) => {
	cookies.delete(SESSION_COOKIE, { path: SESSION_COOKIE_OPTIONS.path });
	return json({ cleared: true });
};
