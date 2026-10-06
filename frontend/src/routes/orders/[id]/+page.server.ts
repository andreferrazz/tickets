import { error } from '@sveltejs/kit';
import { requireSessionUser } from '$lib/modules/sessions/require-user';
import type { PageServerLoad } from './$types';

/**
 * One order with its items and, once issued, its passes with their QR codes.
 *
 * Someone else's order is a 404, not a 403, mirroring Phoenix's
 * `Orders.get_order/2`: the response must not confirm the order exists.
 */
export const load: PageServerLoad = async ({ locals, params, url }) => {
    const user = requireSessionUser(locals.user, url.pathname);
    const data = await locals.container.ordersBff.show(user, params.id);

    if (!data.order && !data.loadFailed) {
        error(404, 'order not found');
    }

    return data;
};
