import type { Queryable } from '$lib/db/queryable';
import type { SessionUser } from './types';

export interface SessionRepository {
    /**
     * Session lookups against database.
     */
    findUserByToken(token: string): Promise<SessionUser | null>;

    /** Stores a session for `userId` that expires in `ttlDays`. */
    insert(userId: string, token: string, ttlDays: number): Promise<void>;

    /** Revokes `token`; a token that never existed is not an error. */
    deleteByToken(token: string): Promise<void>;
}

export function getSessionRepository(queryable: Queryable): SessionRepository {
    return {
        async findUserByToken(token: string): Promise<SessionUser | null> {
            const sql = `
				select u.id, u.role,
				       -- The same rule the user mapper applies when it serialises a user.
				       u.abacate_customer_id is not null as "profileComplete"
				from sessions s
				join users u on u.id = s.user_id
				where s.token = $1 and s.expires_at > (now() at time zone 'utc')`;
            const rows = await queryable.query<SessionUser>(sql, [token]);
            return rows[0] ?? null;
        },

        async insert(userId, token, ttlDays) {
            await queryable.query(
                `insert into sessions (user_id, token, expires_at, inserted_at)
                 values ($1, $2, (now() at time zone 'utc') + make_interval(days => $3), now() at time zone 'utc')`,
                [userId, token, ttlDays]
            );
        },

        async deleteByToken(token) {
            await queryable.query(`delete from sessions where token = $1`, [token]);
        }
    };
}
