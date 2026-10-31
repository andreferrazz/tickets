import { error, fail, redirect } from '@sveltejs/kit';
import { text } from '$lib/utils/form-fields';
import type { Actions, PageServerLoad } from './$types';

/**
 * The first-run form: names the admin of a database that has none. Once one
 * exists the page is gone, 404 rather than a redirect, so nothing hints that
 * a setup step ever existed.
 */
export const load: PageServerLoad = async ({ locals }) => {
    if (await locals.container.setup.adminExists()) error(404, 'not found');
    return {};
};

/** Creates the admin and hands them to the login form, address filled in, for the code. */
export const actions: Actions = {
    create: async ({ request, locals }) => {
        const email = text(await request.formData(), 'email');
        const result = await locals.container.setup.createAdmin(email);
        if (!result.ok) {
            const status = result.failure === 'already_set_up' ? 409 : 422;
            return fail(status, { error: result.failure });
        }
        redirect(303, `/auth/login?email=${encodeURIComponent(result.email)}`);
    }
};
