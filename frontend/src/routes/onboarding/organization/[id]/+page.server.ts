import { fail, redirect } from '@sveltejs/kit';
import { statusForFailure } from '$lib/forms/action-status';
import { text } from '$lib/utils/form-fields';
import { requireSessionUser } from '$lib/modules/sessions/require-user';
import type { Actions, PageServerLoad } from './$types';

/**
 * The post-invite rename form. Prefilled with the placeholder name the
 * invitation gave the organization; leaders only, admins bypass.
 */
export const load: PageServerLoad = async ({ locals, params, url }) => {
    const user = requireSessionUser(locals.user, url.pathname);
    const organization = await locals.container.organizations.findById(params.id);
    if (!organization || !(await locals.container.organizations.isLeader(user, organization.id))) {
        redirect(303, '/');
    }
    return { organizationId: organization.id, name: organization.name };
};

export const actions: Actions = {
    rename: async ({ request, locals, params, url }) => {
        const user = requireSessionUser(locals.user, url.pathname);
        const result = await locals.container.organizations.rename(
            user,
            params.id,
            text(await request.formData(), 'name')
        );
        if (!result.ok) return fail(statusForFailure(result.failure), { error: result.failure });
        redirect(303, '/');
    }
};
