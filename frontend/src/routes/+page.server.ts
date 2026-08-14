import type { HomeFilters } from '$lib/bff/home';
import type { PageServerLoad } from './$types';

/**
 * The event list for the home page. Drafts appear here for members of the
 * owning organization, so this depends on `locals.user` from the session cookie.
*
* The search text and the closed-events toggle live in the query string rather
* than in component state: this page is server-rendered, so filtering here is
 * what makes a filtered view correct in the served HTML, survive a reload, and
 * be shareable as a link.
*
* Failures are returned rather than thrown: the page has its own error state,
* and swapping the whole page for an error boundary would be a downgrade from
* the previous client-fetched behaviour.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	return await locals.container.homeBff.index(locals.user, parseHomeFilters(url));
};

function parseHomeFilters(url: URL): HomeFilters {
	return {
		closed: url.searchParams.get('closed') === '1',
		search: (url.searchParams.get('search') ?? '').trim()
	};
}
