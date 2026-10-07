import { fail } from '@sveltejs/kit';
import { statusForFailure } from '$lib/forms/action-status';
import { requireSessionUser } from '$lib/modules/sessions/require-user';
import { text } from '$lib/utils/form-fields';
import type { Actions, PageServerLoad } from './$types';

/**
 * The caller's own orders. Anonymous visitors are sent to log in and brought
 * back here, where the client page used to do the same after hydration.
 *
 * Failures are returned rather than thrown: the page keeps its own error state,
 * the same way the home page does.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
    const user = requireSessionUser(locals.user, url.pathname);
    return await locals.container.ordersBff.index(user);
};

/** Cancels the order of the row whose button was pressed; the list re-reads itself. */
export const actions: Actions = {
    cancel: async ({ request, locals, url }) => {
        const user = requireSessionUser(locals.user, url.pathname);
        const orderId = text(await request.formData(), 'order_id');
        const cancellation = locals.container.orderCancellation;
        const result = await cancellation.cancelForBuyer(user, orderId, url.origin);
        if (!result.ok) return fail(statusForFailure(result.failure), { error: result.failure });
        return { cancelled: true };
    }
};
