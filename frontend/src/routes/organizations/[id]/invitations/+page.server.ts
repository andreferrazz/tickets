import { redirect } from '@sveltejs/kit';
import { requireSessionUser } from '$lib/modules/sessions/require-user';
import type { PageServerLoad } from './$types';

/**
 * Members and invitations of one organization, for its leader and
 * participants (admins bypass). Anyone else is sent home, which is what the
 * client page did once it had loaded the memberships.
 */
export const load: PageServerLoad = async ({ locals, params, url }) => {
    const user = requireSessionUser(locals.user, url.pathname);
    const data = await locals.container.organizationsBff.team(user, params.id);

    if (!data.organization && !data.loadFailed) {
        redirect(303, '/');
    }

    return { ...data, currentUserId: user.id };
};
