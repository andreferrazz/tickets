import { error } from '@sveltejs/kit';
import { requireSessionUser } from '$lib/modules/sessions/require-user';
import type { PageServerLoad } from './$types';

/**
 * Every order on one event, for its managers. Status and name filters stay in
 * the page: the full list is small and was already filtered client-side.
 */
export const load: PageServerLoad = async ({ locals, params, url }) => {
    const user = requireSessionUser(locals.user, url.pathname);
    const data = await locals.container.eventOrdersBff.index(user, params.id);

    if (!data.orders && !data.loadFailed) {
        error(404, 'event not found');
    }

    return data;
};
