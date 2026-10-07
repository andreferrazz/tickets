import { error, fail } from '@sveltejs/kit';
import { statusForFailure } from '$lib/forms/action-status';
import type { BuyersTarget } from '$lib/modules/events/stats-types';
import { requireSessionUser } from '$lib/modules/sessions/require-user';
import { text } from '$lib/utils/form-fields';
import type { Actions, PageServerLoad } from './$types';

/**
 * The creator dashboard. A `buyers=ticket:<id>` or `buyers=extra:<id>` query
 * parameter opens the buyers list of one item: it lives in the URL so the list
 * is server-rendered and survives a reload, like the home page filters.
 *
 * A `withdraw` parameter opens the withdraw dialog the same way, for the
 * organization's leader; its payout history is only read then.
 *
 * An event the caller may not manage is a 404, as Phoenix's stats endpoint
 * answered: "forbidden" would confirm the event exists.
 */
export const load: PageServerLoad = async ({ locals, params, url }) => {
    const user = requireSessionUser(locals.user, url.pathname);
    const data = await locals.container.dashboardBff.show(user, params.id, parseBuyers(url));

    if (!data.stats && !data.loadFailed) {
        error(404, 'event not found');
    }

    const withdrawing = url.searchParams.has('withdraw') && data.stats?.canWithdraw;
    const payouts = withdrawing ? await locals.container.payouts.listRecent(user, params.id) : null;
    return { ...data, payouts };
};

/**
 * The withdraw dialog's two forms. Both are for the organization's leader (or
 * an admin); the service refuses everyone else whatever the page showed them.
 */
export const actions: Actions = {
    savePayoutKey: async ({ request, locals, params, url }) => {
        const user = requireSessionUser(locals.user, url.pathname);
        const form = await request.formData();
        const destination = {
            pixKey: text(form, 'pix_key'),
            pixKeyType: text(form, 'pix_key_type')
        };
        const result = await locals.container.payouts.saveDestination(user, params.id, destination);
        if (result.ok) return { action: 'savePayoutKey' };
        return fail(statusForFailure(result.failure), {
            action: 'savePayoutKey',
            error: result.failure
        });
    },

    withdraw: async ({ request, locals, params, url }) => {
        const user = requireSessionUser(locals.user, url.pathname);
        const amountCents = Number(text(await request.formData(), 'amount_cents'));
        const result = await locals.container.payouts.request(user, params.id, amountCents);
        if (result.ok) return { action: 'withdraw' };
        return fail(statusForFailure(result.failure), {
            action: 'withdraw',
            error: result.failure
        });
    }
};

function parseBuyers(url: URL): BuyersTarget | null {
    const raw = url.searchParams.get('buyers');
    const [kind, id] = raw?.split(':') ?? [];
    if ((kind !== 'ticket' && kind !== 'extra') || !id) return null;
    return { kind, id };
}
