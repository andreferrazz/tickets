import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '$lib/modules/sessions/cookie';
import type { PageServerLoad } from './$types';

/**
 * Consumes an invitation link. A live token signs the invitee in on the spot:
 * the session becomes the cookie here, and the page keeps the browser's copy
 * and decides where they go next (a new leader names their organization first).
 */
export const load: PageServerLoad = async ({ locals, params, cookies }) => {
    const result = await locals.container.invitationWrites.accept(params.token);
    if (!result.ok) return { failure: result.failure, accepted: null };
    const { sessionToken, user, organization } = result.value;
    cookies.set(SESSION_COOKIE, sessionToken, SESSION_COOKIE_OPTIONS);
    return {
        failure: null,
        accepted: {
            token: sessionToken,
            user: locals.container.userMapper.toDto(user),
            organization
        }
    };
};
