import { error, fail } from '@sveltejs/kit';
import { statusForFailure } from '$lib/forms/action-status';
import { requireSessionUser } from '$lib/modules/sessions/require-user';
import { text } from '$lib/utils/form-fields';
import type { Actions, PageServerLoad } from './$types';

/**
 * The scanner for one event. Admins and every member of the event's
 * organization may open it, scan-only staff included; for anyone else the
 * event does not exist.
 */
export const load: PageServerLoad = async ({ locals, params, url }) => {
    const user = requireSessionUser(locals.user, url.pathname);
    const event = await locals.container.passCheckIn.scannableEvent(user, params.id);
    if (!event) error(404, 'event not found');
    return { eventTitle: event.title };
};

/** One scan: the camera and the typed code both post here. */
export const actions: Actions = {
    checkin: async ({ request, locals, params, url }) => {
        const user = requireSessionUser(locals.user, url.pathname);
        const token = text(await request.formData(), 'token').trim();
        const result = await locals.container.passCheckIn.checkIn(user, params.id, token);
        if (!result.ok) return fail(statusForFailure(result.failure), { error: result.failure });
        return { scan: result.value };
    }
};
