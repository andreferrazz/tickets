import { readOrderReconcilerConfig } from '$lib/config/order-reconciler';
import { getContainer } from '$lib/container';
import { startOrderReconciler } from '$lib/modules/orders/reconciler-schedule';
import { SESSION_COOKIE } from '$lib/modules/sessions/cookie';
import { profileGateTarget } from '$lib/modules/sessions/profile-gate';
import { redirect, type Handle, type ServerInit } from '@sveltejs/kit';

/**
 * Runs once when the server starts. The only background work this app has is
 * the stale-order sweep, which every server runs unless told not to
 * (`ORDER_RECONCILER=off`); a bad setting stops the boot rather than silently
 * not sweeping.
 */
export const init: ServerInit = () => {
    const reconciler = readOrderReconcilerConfig();
    if (reconciler) startOrderReconciler(getContainer().orderReconciler, reconciler);
};

/**
 * Builds the request's object graph and identifies the caller once, so handlers
 * downstream neither assemble their own dependencies nor repeat the lookup.
 *
 * A database problem during the lookup degrades the request to anonymous rather
 * than failing it: public pages keep working and private ones send the visitor
 * to log in.
 *
 * A caller who never finished the profile step is sent to it before any page
 * is rendered, so the redirect needs no JavaScript and shows no flash.
 */
export const handle: Handle = async ({ event, resolve }) => {
    const container = getContainer();
    const token = event.cookies.get(SESSION_COOKIE);
    const user = await container.sessionService.resolveUser(token);
    event.locals.user = user;
    event.locals.container = container;
    const profileStep = profileGateTarget(user, {
        method: event.request.method,
        routeId: event.route.id,
        isDataRequest: event.isDataRequest,
        url: event.url
    });
    if (profileStep) redirect(303, profileStep);
    return resolve(event);
};
