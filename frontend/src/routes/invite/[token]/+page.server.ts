import { fail } from '@sveltejs/kit';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '$lib/modules/sessions/cookie';
import type { Actions, PageServerLoad } from './$types';

/**
 * An invitation link. Opening it only describes the invitation: nothing is
 * accepted and no session is minted on a GET, because mail scanners and link
 * previews fetch links too and would otherwise use the invitation up. Accepting
 * is the `accept` action, as it was a POST in Phoenix.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
    const peeked = await locals.container.invitationWrites.peek(params.token);
    if (!peeked.ok) return { failure: peeked.failure, invitation: null };
    return { failure: null, invitation: peeked.value };
};

export const actions: Actions = {
    accept: async ({ locals, params, cookies }) => {
        const result = await locals.container.invitationWrites.accept(params.token);
        if (!result.ok) return fail(410, { failure: result.failure });
        const { sessionToken, user, organization } = result.value;
        cookies.set(SESSION_COOKIE, sessionToken, SESSION_COOKIE_OPTIONS);
        return {
            accepted: {
                token: sessionToken,
                user: locals.container.userMapper.toDto(user),
                organization
            }
        };
    }
};
