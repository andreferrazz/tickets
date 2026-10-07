import { requireSessionUser } from '$lib/modules/sessions/require-user';
import type { PageServerLoad } from './$types';

/** The events the caller may scan: every event of every organization they belong to. */
export const load: PageServerLoad = async ({ locals, url }) => {
    const user = requireSessionUser(locals.user, url.pathname);
    return await locals.container.scanBff.index(user);
};
