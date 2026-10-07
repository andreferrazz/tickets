import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { text } from '$lib/modules/events/management-forms';
import { requireSessionUser } from '$lib/modules/sessions/require-user';
import type { Actions, PageServerLoad } from './$types';

/**
 * Members and invitations of one organization, for its leader and
 * participants (admins bypass). Anyone else is sent home, which is what the
 * client page did once it had loaded the memberships.
 */
export const load: PageServerLoad = async ({ locals, params, url }) => {
    const user = requireSessionUser(locals.user, url.pathname);
    const data = await locals.container.organizationsBff.team(user, params.id);

    if (!data.organization && !data.loadFailed) {
        redirect(303, '/');
    }

    return { ...data, currentUserId: user.id };
};

type Outcome = { ok: true } | { ok: false; failure: string };

function answer(name: string, result: Outcome) {
    if (result.ok) return { action: name, ok: true };
    const status =
        result.failure === 'forbidden' ? 403 : result.failure === 'not_found' ? 404 : 422;
    return fail(status, { action: name, error: result.failure });
}

function caller(event: RequestEvent) {
    return requireSessionUser(event.locals.user, event.url.pathname);
}

/** The writes of the team page: invite, change a member's role, remove a member. */
export const actions: Actions = {
    invite: async (event) => {
        const form = await event.request.formData();
        const result = await event.locals.container.invitationWrites.create(
            caller(event),
            {
                email: text(form, 'email'),
                organizationId: event.params.id,
                role: text(form, 'role') || null,
                organizationName: null
            },
            event.url.origin
        );
        return answer('invite', result);
    },
    setRole: async (event) => {
        const form = await event.request.formData();
        const result = await event.locals.container.organizations.setMemberRole(
            caller(event),
            event.params.id,
            text(form, 'user_id'),
            text(form, 'role')
        );
        return answer('setRole', result);
    },
    removeMember: async (event) => {
        const form = await event.request.formData();
        const result = await event.locals.container.organizations.removeMember(
            caller(event),
            event.params.id,
            text(form, 'user_id')
        );
        return answer('removeMember', result);
    }
};
