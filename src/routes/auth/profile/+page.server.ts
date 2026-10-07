import { text } from '$lib/utils/form-fields';
import { fail, redirect } from '@sveltejs/kit';
import { requireSessionUser } from '$lib/modules/sessions/require-user';
import { safeNext } from '$lib/utils/next';
import type { Actions, PageServerLoad } from './$types';

/**
 * The post-signup profile step. A caller whose profile is already complete is
 * sent on to `next`; the form is prefilled from the database, not from
 * whatever the browser remembers.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
    const sessionUser = requireSessionUser(locals.user, url.pathname);
    const next = safeNext(url.searchParams.get('next')) ?? '/';
    const user = await locals.container.authBff.currentUser(sessionUser);
    if (!user) redirect(303, '/auth/login');
    if (user.profileComplete) redirect(303, next);
    return { user, next };
};

export const actions: Actions = {
    save: async ({ request, locals, url }) => {
        const sessionUser = requireSessionUser(locals.user, url.pathname);
        const form = await request.formData();
        const input = {
            name: text(form, 'name'),
            cellphone: text(form, 'cellphone'),
            taxId: text(form, 'tax_id')
        };

        const outcome = await locals.container.authBff.completeProfile(sessionUser, input);
        if (outcome.ok) return { user: outcome.user };
        if ('fieldErrors' in outcome) return fail(422, { fieldErrors: outcome.fieldErrors });
        return fail(outcome.failure === 'abacate_unavailable' ? 502 : 422, {
            error: outcome.failure
        });
    }
};
