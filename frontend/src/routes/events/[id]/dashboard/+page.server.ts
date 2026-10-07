import { error } from '@sveltejs/kit';
import type { BuyersTarget } from '$lib/modules/events/stats-types';
import { requireSessionUser } from '$lib/modules/sessions/require-user';
import type { PageServerLoad } from './$types';

/**
 * The creator dashboard. A `buyers=ticket:<id>` or `buyers=extra:<id>` query
 * parameter opens the buyers list of one item: it lives in the URL so the list
 * is server-rendered and survives a reload, like the home page filters.
 *
 * An event the caller may not manage is a 404, as Phoenix's stats endpoint
 * answered: "forbidden" would confirm the event exists.
 */
export const load: PageServerLoad = async ({ locals, params, url }) => {
    const user = requireSessionUser(locals.user, url.pathname);
    const data = await locals.container.dashboardBff.show(user, params.id, parseBuyers(url));

    if (!data.stats && !data.loadFailed) {
        error(404, 'event not found');
    }

    return data;
};

function parseBuyers(url: URL): BuyersTarget | null {
    const raw = url.searchParams.get('buyers');
    const [kind, id] = raw?.split(':') ?? [];
    if ((kind !== 'ticket' && kind !== 'extra') || !id) return null;
    return { kind, id };
}
