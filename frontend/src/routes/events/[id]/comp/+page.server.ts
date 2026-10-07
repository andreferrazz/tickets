import { error, fail } from '@sveltejs/kit';
import { statusForFailure } from '$lib/forms/action-status';
import { parseCompRecipients } from '$lib/modules/orders/cart-form';
import { requireSessionUser } from '$lib/modules/sessions/require-user';
import { text } from '$lib/utils/form-fields';
import type { Actions, PageServerLoad } from './$types';

/**
 * The comp page of one event, for its managers: the ticket types that can be
 * given away. For anyone else the event does not exist.
 */
export const load: PageServerLoad = async ({ locals, params, url }) => {
    const user = requireSessionUser(locals.user, url.pathname);
    const data = await locals.container.eventManagementBff.editPage(user, params.id);
    if (!data.event && !data.loadFailed) error(404, 'event not found');
    return data;
};

/** Sends free tickets of one type to a guest list; answers who got them and who did not. */
export const actions: Actions = {
    send: async ({ request, locals, params, url }) => {
        const user = requireSessionUser(locals.user, url.pathname);
        const form = await request.formData();
        const result = await locals.container.compTickets.issue(user, {
            eventId: params.id,
            ticketTypeId: text(form, 'ticket_type_id'),
            recipients: parseCompRecipients(form),
            origin: url.origin
        });
        if (!result.ok) return fail(statusForFailure(result.failure), { error: result.failure });
        return { summary: result.value };
    }
};
