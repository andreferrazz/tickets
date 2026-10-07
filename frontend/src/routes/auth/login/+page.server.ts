import { fail, redirect } from '@sveltejs/kit';
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
        const email = String(form.get('email') ?? '').trim();
        const next = safeNext(String(form.get('next') ?? ''));
        if (!email) return fail(400, { error: 'email required' });

        const outcome = await locals.container.authBff.requestCode(
            email,
            clientAddress(getClientAddress)
        );
        if (outcome === 'rate_limited') {
            return fail(429, { error: 'too many requests — try again in a minute' });
        }

        const params = new URLSearchParams({ email });
        if (next) params.set('next', next);
        redirect(303, `/auth/verify?${params}`);
    }
};

// Behind a proxy without the address header, or in a test runner, there may be
// no address; one shared bucket is safer than skipping the limit.
function clientAddress(read: () => string): string {
    try {
        return read();
    } catch {
        return 'unknown';
    }
}
