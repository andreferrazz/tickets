import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { EventManagementService } from '$lib/modules/events/management-service';
import {
    parseBatchInput,
    parseEventInput,
    parseExtraInput,
    parseSectionInput,
    text
} from '$lib/modules/events/management-forms';
import type { ManagementResult } from '$lib/modules/events/management-types';
import { requireSessionUser } from '$lib/modules/sessions/require-user';
import type { SessionUser } from '$lib/modules/sessions/types';
import type { Actions, PageServerLoad } from './$types';

/**
 * The event edit page: one load, one action per thing the page can change.
 * Every row on the page is its own small form, so each action reads a flat
 * set of fields and the page re-reads itself afterwards.
 */
export const load: PageServerLoad = async ({ locals, params, url }) => {
    const user = requireSessionUser(locals.user, url.pathname);
    const data = await locals.container.eventManagementBff.editPage(user, params.id);
    if (!data.event && !data.loadFailed) error(404, 'event not found');
    return data;
};

type Run = (
    service: EventManagementService,
    user: SessionUser,
    form: FormData
) => Promise<ManagementResult<unknown>>;

/** Runs one management call and turns its result into the action's answer. */
function action(name: string, run: Run) {
    return async ({ request, locals, url }: RequestEvent) => {
        const user = requireSessionUser(locals.user, url.pathname);
        const result = await run(locals.container.eventManagement, user, await request.formData());
        if (!result.ok) {
            return fail(statusFor(result.failure), {
                action: name,
                error: result.failure,
                fieldErrors: result.fieldErrors ?? null
            });
        }
        return { action: name, ok: true };
    };
}

function statusFor(failure: string): number {
    if (failure === 'not_found') return 404;
    if (failure === 'forbidden') return 403;
    if (failure === 'abacate_unavailable') return 502;
    if (failure === 'batch_has_sales' || failure === 'section_not_empty') return 409;
    return 422;
}

export const actions: Actions = {
    updateEvent: action('updateEvent', (s, u, f) =>
        s.updateEvent(u, text(f, 'event_id'), parseEventInput(f))
    ),
    deleteEvent: async (event) => {
        const user = requireSessionUser(event.locals.user, event.url.pathname);
        const result = await event.locals.container.eventManagement.deleteEvent(
            user,
            event.params.id
        );
        if (!result.ok)
            return fail(statusFor(result.failure), {
                action: 'deleteEvent',
                error: result.failure,
                fieldErrors: null
            });
        redirect(303, '/');
    },
    addTicketType: action('addTicketType', (s, u, f) =>
        s.createTicketType(u, text(f, 'event_id'), { name: text(f, 'name') })
    ),
    updateTicketType: action('updateTicketType', (s, u, f) =>
        s.updateTicketType(u, text(f, 'id'), { name: text(f, 'name') })
    ),
    deleteTicketType: action('deleteTicketType', (s, u, f) => s.deleteTicketType(u, text(f, 'id'))),
    addBatch: action('addBatch', (s, u, f) =>
        s.createBatch(u, text(f, 'ticket_type_id'), parseBatchInput(f))
    ),
    updateBatch: action('updateBatch', (s, u, f) =>
        s.updateBatch(u, text(f, 'id'), parseBatchInput(f))
    ),
    closeBatch: action('closeBatch', (s, u, f) => s.closeBatch(u, text(f, 'id'))),
    deleteBatch: action('deleteBatch', (s, u, f) => s.deleteBatch(u, text(f, 'id'))),
    addExtra: action('addExtra', (s, u, f) =>
        s.createExtra(u, text(f, 'event_id'), parseExtraInput(f))
    ),
    updateExtra: action('updateExtra', (s, u, f) =>
        s.updateExtra(u, text(f, 'id'), parseExtraInput(f))
    ),
    deleteExtra: action('deleteExtra', (s, u, f) => s.deleteExtra(u, text(f, 'id'))),
    addSection: action('addSection', (s, u, f) =>
        s.createSection(u, text(f, 'event_id'), parseSectionInput(f))
    ),
    updateSection: action('updateSection', (s, u, f) =>
        s.updateSection(u, text(f, 'id'), parseSectionInput(f))
    ),
    deleteSection: action('deleteSection', (s, u, f) => s.deleteSection(u, text(f, 'id'))),
    reorderSections: action('reorderSections', (s, u, f) =>
        s.reorderSections(u, text(f, 'event_id'), text(f, 'order').split(',').filter(Boolean))
    )
};
