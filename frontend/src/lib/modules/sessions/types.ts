import type { Role } from '$lib/types';

/**
 * The caller behind a request, resolved from the session cookie. Deliberately
 * narrow: only what server-side authorization needs. Anything the UI renders
 * still comes from the client-side auth store.
 */
export interface SessionUser {
	id: string;
	role: Role;
}
