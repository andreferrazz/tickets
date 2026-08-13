import type { SessionRepository, SessionService, SessionUser } from './types';

/**
 * Resolves who is behind a request. An absent, unknown, revoked, or expired
 * token are all the same answer here: the request is anonymous.
 *
 * @example
 * const user = await sessionService({ repository }).resolveUser(cookies.get(SESSION_COOKIE));
 */
export function sessionService(deps: { repository: SessionRepository }): SessionService {
	const { repository } = deps;
	return {
		async resolveUser(token: string | undefined): Promise<SessionUser | null> {
			// Skipping the query for an anonymous request keeps the database out of
			// the path of every logged-out page view.
			if (!token) return null;
			return repository.findUserByToken(token);
		}
	};
}
