import { getContainer } from '$lib/container';
import { SESSION_COOKIE } from '$lib/modules/sessions/cookie';
import type { Handle } from '@sveltejs/kit';

/**
 * Builds the request's object graph and identifies the caller once, so handlers
 * downstream neither assemble their own dependencies nor repeat the lookup.
 *
 * A database problem during the lookup degrades the request to anonymous rather
 * than failing it: public pages keep working and private ones send the visitor
 * to log in.
 */
export const handle: Handle = async ({ event, resolve }) => {
    const container = getContainer();
    const token = event.cookies.get(SESSION_COOKIE);
    const user = await container.sessionService.resolveUser(token);
    event.locals.user = user;
    event.locals.container = container;
    return resolve(event);
};
