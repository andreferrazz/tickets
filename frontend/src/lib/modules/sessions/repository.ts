import type { Queryable } from '$lib/db/queryable';
import type { SessionRepository, SessionUser } from './types';

// `sessions.expires_at` is a `timestamp` WITHOUT time zone holding UTC (Ecto's
// `:utc_datetime`). Comparing it against `now()` directly would coerce it using
// the connection's TimeZone setting, so normalise to naive UTC on both sides.
const FIND_USER_BY_TOKEN = `
	select u.id, u.role
	from sessions s
	join users u on u.id = s.user_id
	where s.token = $1
		and s.expires_at > (now() at time zone 'utc')
`;

/**
 * Session lookups against Postgres. Mirrors
 * `Backend.Accounts.get_user_by_token/1` in the Phoenix app.
 *
 * @example
 * const user = await sessionRepository({ queryable }).findUserByToken(token);
 */
export function sessionRepository(deps: { queryable: Queryable }): SessionRepository {
	const { queryable } = deps;
	return {
		async findUserByToken(token: string): Promise<SessionUser | null> {
			const rows = await queryable.query<SessionUser>(FIND_USER_BY_TOKEN, [token]);
			return rows[0] ?? null;
		}
	};
}
