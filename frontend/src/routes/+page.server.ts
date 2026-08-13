import { toEventJson } from '$lib/modules/events/serializer';
import type { Event } from '$lib/types';
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
	try {
		const rows = await locals.container.events.listVisible(locals.user);
		return { events: rows.map(toEventJson), loadFailed: false };
	} catch (cause) {
		console.error(JSON.stringify({ event: 'home_events_load_failed', error: String(cause) }));
		return { events: [] as Event[], loadFailed: true };
	}
};
