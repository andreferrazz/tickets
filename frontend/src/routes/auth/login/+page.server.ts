import { text } from '$lib/utils/form-fields';
import { fail, redirect } from '@sveltejs/kit';
import { clientAddressOf } from '$lib/utils/client-address';
import { safeNext } from '$lib/utils/next';
import type { Actions } from './$types';

/**
 * Step one of passwordless login: a code by email, then on to the verify page
 * with the address and the `next` target in the URL. The login modal posts to
 * the same action and intercepts the redirect to stay in place.
 */
export const actions: Actions = {
    request: async ({ request, locals, getClientAddress }) => {
        const form = await request.formData();
        const email = text(form, 'email').trim();
        const next = safeNext(text(form, 'next'));
        if (!email) return fail(400, { error: 'email_required' });

        const outcome = await locals.container.authBff.requestCode(
            email,
            clientAddressOf(getClientAddress)
        );
        if (outcome === 'rate_limited') {
            return fail(429, { error: 'rate_limited' });
        }
        if (outcome === 'invalid_email') return fail(400, { error: 'invalid_email' });

        const params = new URLSearchParams({ email });
        if (next) params.set('next', next);
        redirect(303, `/auth/verify?${params}`);
    }
};
