import { requireSessionUser } from '$lib/modules/sessions/require-user';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** The invitations an admin sent. Non-admins are sent home, as before. */
export const load: PageServerLoad = async ({ locals, url }) => {
    const user = requireSessionUser(locals.user, url.pathname);
    if (user.role !== 'admin') redirect(303, '/');
    return await locals.container.adminBff.invitations(user);
};
