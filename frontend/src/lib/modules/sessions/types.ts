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

export interface SessionRepository {
	findUserByToken(token: string): Promise<SessionUser | null>;
}

export interface SessionService {
	/** The bearer of `token`, or null when the request is anonymous. */
	resolveUser(token: string | undefined): Promise<SessionUser | null>;
}
