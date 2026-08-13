import type { SessionRepository } from './repository';
import type { SessionUser } from './types';

export interface SessionService {
	
	/** 
	 * The bearer of `token`, or null when the request is anonymous.
 	 * 
	 * Resolves who is behind a request. An absent, unknown, revoked, or expired
 	 * token are all the same answer here: the request is anonymous.
	 */
	resolveUser(token: string | undefined): Promise<SessionUser | null>;
}

export function getSessionService(repository: SessionRepository): SessionService {
	return {
	
		async resolveUser(token: string | undefined): Promise<SessionUser | null> {
			if (!token) return null;
			
			try {
				return repository.findUserByToken(token);
			} catch (cause) {
				console.error(JSON.stringify({ event: 'session_lookup_failed', error: String(cause) }));
				return null;
			}
		}
	
	};
}
