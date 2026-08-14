import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * One event and everything it sells. Drafts resolve only for members of the
 * owning organization, so this depends on `locals.user` from the session cookie.
 *
 * A miss is a 404 rather than a 403, mirroring the `visible?/2` rule in Phoenix's
 * EventController: answering "forbidden" would confirm that a draft exists.
 *
 * Database failures are returned instead, not thrown: the page keeps its own
 * error state, the same way the home page does.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
    const data = await locals.container.eventsBff.show(locals.user, params.id);

    if (!data.event && !data.loadFailed) {
        error(404, 'event not found');
    }

    return data;
};
