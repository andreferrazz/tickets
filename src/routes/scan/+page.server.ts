import { redirect } from '@sveltejs/kit';
import { canScan } from '$lib/modules/accounts/roles';
import { requireSessionUser } from '$lib/modules/sessions/require-user';
import type { PageServerLoad } from './$types';

/** The events the caller may scan: every live event, for anyone with a role; buyers are sent home. */
export const load: PageServerLoad = async ({ locals, url }) => {
    const user = requireSessionUser(locals.user, url.pathname);
    if (!canScan(user.role)) redirect(303, '/');
    return await locals.container.scanBff.index(user);
};
