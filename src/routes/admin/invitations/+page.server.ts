import { requireSessionUser } from '$lib/modules/sessions/require-user';
import { fail, redirect } from '@sveltejs/kit';
import { statusForFailure } from '$lib/forms/action-status';
import { text } from '$lib/utils/form-fields';
import type { Actions, PageServerLoad } from './$types';

/** The invitations an admin sent. Non-admins are sent home, as before. */
export const load: PageServerLoad = async ({ locals, url }) => {
    const user = requireSessionUser(locals.user, url.pathname);
    if (user.role !== 'admin') redirect(303, '/');
    return await locals.container.adminBff.invitations(user);
};

/** An admin's invitation creates the organization and invites its leader. */
export const actions: Actions = {
    invite: async ({ request, locals, url }) => {
        const user = requireSessionUser(locals.user, url.pathname);
        if (user.role !== 'admin') return fail(403, { error: 'forbidden' });
        const form = await request.formData();
        const result = await locals.container.invitationWrites.create(
            user,
            {
                email: text(form, 'email'),
                organizationId: null,
                role: null,
                organizationName: text(form, 'organization_name') || null
            },
            url.origin
        );
        if (!result.ok) return fail(statusForFailure(result.failure), { error: result.failure });
        return { ok: true };
    }
};
