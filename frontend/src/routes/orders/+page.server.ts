import { requireSessionUser } from '$lib/modules/sessions/require-user';
import type { PageServerLoad } from './$types';

/**
 * The caller's own orders. Anonymous visitors are sent to log in and brought
 * back here, where the client page used to do the same after hydration.
 *
 * Failures are returned rather than thrown: the page keeps its own error state,
 * the same way the home page does.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
    const user = requireSessionUser(locals.user, url.pathname);
    return await locals.container.ordersBff.index(user);
};
