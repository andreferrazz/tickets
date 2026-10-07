import { error, fail, redirect } from '@sveltejs/kit';
import { statusForFailure } from '$lib/forms/action-status';
import { parseCartForm, parsePaymentMethod } from '$lib/modules/orders/cart-form';
import { requireSessionUser } from '$lib/modules/sessions/require-user';
import { text } from '$lib/utils/form-fields';
import type { Actions, PageServerLoad } from './$types';

/**
 * One event and everything it sells. Drafts resolve only for members of the
 * owning organization, so this depends on `locals.user` from the session cookie.
 *
 * A miss is a 404 rather than a 403, mirroring the `visible?/2` rule in Phoenix's
 * EventController: answering "forbidden" would confirm that a draft exists.
 *
 * Database failures are returned instead, not thrown: the page keeps its own
 * error state, the same way the home page does.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
    const data = await locals.container.eventsBff.show(locals.user, params.id);

    if (!data.event && !data.loadFailed) {
        error(404, 'event not found');
    }

    // Whether "buy" can go straight to checkout or must ask the visitor to sign
    // in and complete their profile first.
    const viewer = locals.user ? await locals.container.authBff.currentUser(locals.user) : null;
    return { ...data, viewerReady: viewer?.profileComplete ?? false };
};

/**
 * Checkout: the cart arrives as one quantity field per item, the order is
 * placed, and the buyer is sent on to pay, or straight to the order when
 * there was nothing to charge.
 */
export const actions: Actions = {
    buy: async ({ request, locals, params, url }) => {
        const user = requireSessionUser(locals.user, url.pathname);
        const form = await request.formData();
        const paymentMethod = parsePaymentMethod(text(form, 'payment_method'));
        if (paymentMethod === 'invalid')
            return fail(422, { error: 'invalid_payment_method', itemName: null });
        const result = await locals.container.orderPlacement.place(user, {
            eventId: params.id,
            cart: parseCartForm(form),
            paymentMethod,
            origin: url.origin
        });
        if (!result.ok) {
            const itemName = result.itemName ?? null;
            return fail(statusForFailure(result.failure), { error: result.failure, itemName });
        }
        redirect(303, result.value.paymentUrl ?? `/orders/${result.value.id}`);
    }
};
