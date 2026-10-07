import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '$lib/modules/sessions/cookie';
import { requireSessionUser } from '$lib/modules/sessions/require-user';
import type { Actions, PageServerLoad } from './$types';

/** The caller's own profile and memberships. */
export const load: PageServerLoad = async ({ locals, url }) => {
    const user = requireSessionUser(locals.user, url.pathname);
    const data = await locals.container.authBff.profilePage(user);
    if (!data) redirect(303, '/auth/login');
    return data;
};

/** Logging out revokes the session row and drops the cookie; the page clears the browser's copy. */
export const actions: Actions = {
    logout: async ({ locals, cookies }) => {
        const token = cookies.get(SESSION_COOKIE);
        if (token) await locals.container.authBff.logout(token);
        cookies.delete(SESSION_COOKIE, { path: SESSION_COOKIE_OPTIONS.path });
        redirect(303, '/');
    }
};
