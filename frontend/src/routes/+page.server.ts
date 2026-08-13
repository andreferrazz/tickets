import type { HomeData } from '$lib/bff/home';
import type { PageServerLoad } from './$types';

/**
 * The event list for the home page. Drafts appear here for members of the
 * owning organization, so this depends on `locals.user` from the session cookie.
 *
 * Failures are returned rather than thrown: the page has its own error state,
 * and swapping the whole page for an error boundary would be a downgrade from
 * the previous client-fetched behaviour.
 */
export const load: PageServerLoad = async ({ locals }) => {
	return await locals.container.homeBff.index(locals.user);
};
