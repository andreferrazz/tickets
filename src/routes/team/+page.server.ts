import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { statusForFailure } from '$lib/forms/action-status';
import { canLeadTeam } from '$lib/modules/accounts/roles';
import { requireSessionUser } from '$lib/modules/sessions/require-user';
import { text } from '$lib/utils/form-fields';
import type { Actions, PageServerLoad } from './$types';

/**
 * The team: everyone with a role and every invitation, for leaders and
 * admins. Anyone else is sent home, which is what the organization page did.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
    const user = requireSessionUser(locals.user, url.pathname);
    if (!canLeadTeam(user.role)) redirect(303, '/');
    const data = await locals.container.teamBff.page(user);
    return { ...data, currentUserId: user.id };
};

type Outcome = { ok: true } | { ok: false; failure: string };

function answer(name: string, result: Outcome) {
    if (result.ok) return { action: name, ok: true };
    return fail(statusForFailure(result.failure), { action: name, error: result.failure });
}

function caller(event: RequestEvent) {
    return requireSessionUser(event.locals.user, event.url.pathname);
}

/** The writes of the team page: invite, change someone's role, remove them from the team. */
export const actions: Actions = {
    invite: async (event) => {
        const form = await event.request.formData();
        const result = await event.locals.container.invitationWrites.create(
            caller(event),
            { email: text(form, 'email'), role: text(form, 'role') || null },
            event.url.origin
        );
        return answer('invite', result);
    },
    setRole: async (event) => {
        const form = await event.request.formData();
        const result = await event.locals.container.team.setRole(
            caller(event),
            text(form, 'user_id'),
            text(form, 'role')
        );
        return answer('setRole', result);
    },
    remove: async (event) => {
        const form = await event.request.formData();
        const result = await event.locals.container.team.remove(
            caller(event),
            text(form, 'user_id')
        );
        return answer('remove', result);
    }
};
