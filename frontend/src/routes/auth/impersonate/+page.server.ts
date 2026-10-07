import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '$lib/modules/sessions/cookie';
import type { PageServerLoad } from './$types';

/**
 * An admin's "log in as this user" link. The token in the URL is already a
 * session minted for the target user, so a live one simply becomes the cookie;
 * the page then stores the browser's copy and goes home.
 */
export const load: PageServerLoad = async ({ locals, url, cookies }) => {
    const token = url.searchParams.get('token') ?? '';
    const user = token ? await locals.container.authBff.impersonate(token) : null;
    if (!user) return { token: null, user: null };
    cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
    return { token, user };
};
