import { requireSessionUser } from '$lib/modules/sessions/require-user';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Every user, for admins. Non-admins are sent home, as before. */
export const load: PageServerLoad = async ({ locals, url }) => {
    const user = requireSessionUser(locals.user, url.pathname);
    if (user.role !== 'admin') redirect(303, '/');
    return await locals.container.adminBff.users();
};
