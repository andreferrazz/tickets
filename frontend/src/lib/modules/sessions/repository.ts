import type { Queryable } from '$lib/db/queryable';
import type { SessionUser } from './types';

export interface SessionRepository {
	
	/**
	 * Session lookups against database.
	 */
	findUserByToken(token: string): Promise<SessionUser | null>;
}

export function getSessionRepository(queryable: Queryable): SessionRepository {
	return {
		
		async findUserByToken(token: string): Promise<SessionUser | null> {
			const sql = `
				select u.id, u.role
				from sessions s
				join users u on u.id = s.user_id
				where s.token = $1 and s.expires_at > (now() at time zone 'utc')`;
			const rows = await queryable.query<SessionUser>(sql, [token]);
			return rows[0] ?? null;
		}

	};
}
