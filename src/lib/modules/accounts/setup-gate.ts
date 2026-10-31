import type { GatedRequest } from '$lib/modules/sessions/profile-gate';

export const SETUP_STEP = '/setup';

// Routes that stay open while no admin exists: the setup form itself, and the
// endpoints, which serve programs rather than people.
const UNGATED_PREFIXES = ['/setup', '/api/', '/webhooks/', '/e2e-fakes/'];

/**
 * Where to send a visitor while the database has no admin, or null when the
 * request goes ahead. Only page loads are gated, like the profile gate: a
 * form post has its own answer and a data request belongs to a page already
 * being shown.
 *
 * @example
 * const target = setupGateTarget(await setup.adminExists(), { method, routeId, isDataRequest, url });
 * if (target) redirect(303, target); // '/setup'
 */
export function setupGateTarget(adminExists: boolean, request: GatedRequest): string | null {
    if (adminExists) return null;
    if (request.method !== 'GET' || request.isDataRequest || request.routeId === null) return null;
    const { pathname } = request.url;
    if (UNGATED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;
    return SETUP_STEP;
}
