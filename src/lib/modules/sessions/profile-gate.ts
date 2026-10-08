import type { SessionUser } from './types';

/** What the gate needs to know about a request; a slice of SvelteKit's `RequestEvent`. */
export interface GatedRequest {
    method: string;
    /** Null when no route matched, which is a 404 and not ours to redirect. */
    routeId: string | null;
    /** True for the JSON a client-side navigation or an invalidation fetches. */
    isDataRequest: boolean;
    url: URL;
}

const PROFILE_STEP = '/auth/profile';

// Routes a caller with an unfinished profile still reaches: the auth flow
// itself, an invitation link (a way in, like the auth flow: accepting one leads
// to the profile step by itself), and the endpoints, which serve programs
// rather than people.
const UNGATED_PREFIXES = ['/auth/', '/invite/', '/api/', '/webhooks/', '/e2e-fakes/'];

/**
 * Whether a path is closed to a caller whose profile is unfinished. Shared by
 * the server gate below and the layout, so both exempt the same routes.
 *
 * @example
 * isProfileGatedPath('/orders');       // true
 * isProfileGatedPath('/auth/profile'); // false
 */
export function isProfileGatedPath(pathname: string): boolean {
    return !UNGATED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Where to send a signed-in caller whose profile is unfinished, or null when
 * the request goes ahead. Only page loads are gated: a form post has its own
 * answer, and a data request may be the login modal refreshing the page it sits
 * on while its profile step is still open, which a redirect would tear down.
 * Navigations inside the app are gated by the layout instead.
 *
 * @example
 * const target = profileGateTarget(locals.user, { method, routeId, isDataRequest, url });
 * if (target) redirect(303, target); // '/auth/profile?next=%2Forders'
 */
export function profileGateTarget(user: SessionUser | null, request: GatedRequest): string | null {
    if (!user || user.profileComplete) return null;
    if (request.method !== 'GET' || request.isDataRequest || request.routeId === null) return null;
    const { pathname, search } = request.url;
    if (!isProfileGatedPath(pathname)) return null;
    return `${PROFILE_STEP}?next=${encodeURIComponent(pathname + search)}`;
}
