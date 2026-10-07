import { fail, redirect } from '@sveltejs/kit';
import { parseEventInput } from '$lib/modules/events/management-forms';
import { requireSessionUser } from '$lib/modules/sessions/require-user';
import type { Actions, PageServerLoad } from './$types';

/** Creators and admins only; everyone else is sent home, as the client page did. */
export const load: PageServerLoad = ({ locals, url }) => {
    const user = requireSessionUser(locals.user, url.pathname);
    if (user.role !== 'creator' && user.role !== 'admin') redirect(303, '/');
    return {};
};

export const actions: Actions = {
    create: async ({ request, locals, url }) => {
        const user = requireSessionUser(locals.user, url.pathname);
        const result = await locals.container.eventManagement.createEvent(
            user,
            parseEventInput(await request.formData())
        );
        if (!result.ok)
            return fail(422, { error: result.failure, fieldErrors: result.fieldErrors ?? null });
        redirect(303, `/events/${result.value.id}/edit`);
    }
};
