import { redirect } from '@sveltejs/kit';
import type { SessionUser } from './types';

/**
 * The signed-in caller, or a redirect to the login page that brings them back
 * to `nextPath` afterwards. Server-rendered pages that are meaningless without
 * a user call this first, so the redirect happens before any HTML is served.
 *
 * @example
 * export const load: PageServerLoad = async ({ locals, url }) => {
 *     const user = requireSessionUser(locals.user, url.pathname);
 *     ...
 * };
 */
export function requireSessionUser(user: SessionUser | null, nextPath: string): SessionUser {
    if (user) return user;
    redirect(303, `/auth/login?next=${encodeURIComponent(nextPath)}`);
}
