import { getContainer } from '$lib/container';
import { SESSION_COOKIE } from '$lib/modules/sessions/cookie';
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
	const container = getContainer();
	const token = event.cookies.get(SESSION_COOKIE);
	const user = await container.sessionService.resolveUser(token);
	event.locals.user = user;
	event.locals.container = container
	return resolve(event);
};
