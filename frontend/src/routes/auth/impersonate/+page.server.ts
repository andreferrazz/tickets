import { fail } from '@sveltejs/kit';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '$lib/modules/sessions/cookie';
import type { Actions, PageServerLoad } from './$types';

/**
 * An admin's "log in as this user" link. Opening it only shows who the link is
 * for: nothing is consumed and no cookie is set on a GET, so a link preview or
 * a forged image tag cannot sign anyone in. Signing in is the `confirm` action.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
    const token = url.searchParams.get('token') ?? '';
    const target = token ? await locals.container.authBff.impersonationTarget(token) : null;
    return { token, targetEmail: target?.email ?? null };
};

export const actions: Actions = {
    confirm: async ({ request, locals, cookies }) => {
        const token = String((await request.formData()).get('token') ?? '');
        const signedIn = await locals.container.authBff.impersonate(token);
        if (!signedIn) return fail(410, { error: 'invalid_link' });
        cookies.set(SESSION_COOKIE, signedIn.token, SESSION_COOKIE_OPTIONS);
        return { token: signedIn.token, user: signedIn.user };
    }
};
