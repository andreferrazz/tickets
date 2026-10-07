import { requireSessionUser } from '$lib/modules/sessions/require-user';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

/** Every user, for admins. Non-admins are sent home, as before. */
export const load: PageServerLoad = async ({ locals, url }) => {
    const user = requireSessionUser(locals.user, url.pathname);
    if (user.role !== 'admin') redirect(303, '/');
    return await locals.container.adminBff.users();
};

/** A single-use link token for one user, turned into a "log in as" link by the page. */
export const actions: Actions = {
    impersonate: async ({ request, locals, url }) => {
        const user = requireSessionUser(locals.user, url.pathname);
        if (user.role !== 'admin') return fail(403, { error: 'forbidden' });
        const form = await request.formData();
        const userId = String(form.get('userId') ?? '');
        const token = await locals.container.authBff.mintImpersonation(user, userId);
        if (!token) return fail(404, { error: 'user not found' });
        return { token };
    }
};
