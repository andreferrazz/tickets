import { error, fail } from '@sveltejs/kit';
import { statusForFailure } from '$lib/forms/action-status';
import { requireSessionUser } from '$lib/modules/sessions/require-user';
import { text } from '$lib/utils/form-fields';
import type { Actions, PageServerLoad } from './$types';

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

/** A manager cancels a buyer's order on this event, under the buyer's own rules. */
export const actions: Actions = {
    cancel: async ({ request, locals, params, url }) => {
        const user = requireSessionUser(locals.user, url.pathname);
        const orderId = text(await request.formData(), 'order_id');
        const cancellation = locals.container.orderCancellation;
        const result = await cancellation.cancelForManager(user, params.id, orderId, url.origin);
        if (!result.ok) return fail(statusForFailure(result.failure), { error: result.failure });
        return { cancelled: true };
    }
};
