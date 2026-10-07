import { text } from '$lib/utils/form-fields';
import { fail, redirect } from '@sveltejs/kit';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '$lib/modules/sessions/cookie';
import { clientAddressOf } from '$lib/utils/client-address';
import { safeNext } from '$lib/utils/next';
import type { Actions, PageServerLoad } from './$types';

/** The address the code went to comes from the login step's redirect. */
export const load: PageServerLoad = ({ url }) => {
    const email = url.searchParams.get('email')?.trim() ?? '';
    if (!email) redirect(303, '/auth/login');
    return { email, next: safeNext(url.searchParams.get('next')) };
};

/**
 * Step two: the code becomes a session cookie. The token and user are also
 * returned to the page because the browser still keeps a copy for the
 * endpoints Phoenix serves; that copy goes when the last of them moves.
 */
export const actions: Actions = {
    verify: async ({ request, locals, cookies, getClientAddress }) => {
        const form = await request.formData();
        const email = text(form, 'email');
        const code = text(form, 'code').trim();
        const next = safeNext(text(form, 'next')) ?? '/';

        const outcome = await locals.container.authBff.verifyCode(
            email,
            code,
            clientAddressOf(getClientAddress)
        );
        if (!outcome.ok && outcome.failure === 'rate_limited') {
            return fail(429, { error: 'rate_limited' });
        }
        if (!outcome.ok) return fail(401, { error: 'invalid_code' });
        const { signedIn } = outcome;

        cookies.set(SESSION_COOKIE, signedIn.token, SESSION_COOKIE_OPTIONS);
        return { token: signedIn.token, user: signedIn.user, next };
    }
};
