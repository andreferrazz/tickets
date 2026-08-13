import { createContainer } from '$lib/container';
import { deferredQueryable } from '$lib/db/pool';
import { SESSION_COOKIE } from '$lib/modules/sessions/cookie';
import type { SessionService, SessionUser } from '$lib/modules/sessions/types';
import type { Handle } from '@sveltejs/kit';

/**
 * Builds the request's object graph and identifies the caller once, so handlers
 * downstream neither assemble their own dependencies nor repeat the lookup.
 *
 * Most routes are still client-rendered against Phoenix and need nothing from
 * the database, so a database problem here degrades the request to anonymous
 * rather than failing it.
 */
export const handle: Handle = async ({ event, resolve }) => {
	event.locals.container = createContainer({ queryable: deferredQueryable() });
	event.locals.user = await currentUser(
		event.locals.container.sessions,
		event.cookies.get(SESSION_COOKIE)
	);
	return resolve(event);
};

async function currentUser(
	sessions: SessionService,
	token: string | undefined
): Promise<SessionUser | null> {
	try {
		return await sessions.resolveUser(token);
	} catch (cause) {
		console.error(JSON.stringify({ event: 'session_lookup_failed', error: String(cause) }));
		return null;
	}
}
