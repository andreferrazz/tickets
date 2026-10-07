import { error, fail } from '@sveltejs/kit';
import { statusForFailure } from '$lib/forms/action-status';
import { requireSessionUser } from '$lib/modules/sessions/require-user';
import type { Actions, PageServerLoad } from './$types';

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

/** The buyer cancels their own order; the page re-reads it afterwards. */
export const actions: Actions = {
    cancel: async ({ locals, params, url }) => {
        const user = requireSessionUser(locals.user, url.pathname);
        const cancellation = locals.container.orderCancellation;
        const result = await cancellation.cancelForBuyer(user, params.id, url.origin);
        if (!result.ok) return fail(statusForFailure(result.failure), { error: result.failure });
        return { cancelled: true };
    }
};
