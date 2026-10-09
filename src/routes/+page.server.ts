import type { HomeFilters } from '$lib/modules/events/home-filters';
import type { PageServerLoad } from './$types';

/**
 * The event list for the home page. Drafts appear here for members of the
 * owning organization, so this depends on `locals.user` from the session cookie.
 *
 * The search text and the closed-events toggle are read from the query string
 * so a filtered view is correct in the served HTML, survives a reload, and is
 * shareable as a link. They are only parsed here: the page applies them to the
 * full list, on the server render and again in the browser, so toggling one
 * does not come back for another round trip to the database.
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
