import type { Queryable } from '$lib/db/queryable';

export interface NewImpersonationToken {
    token: string;
    userId: string;
    createdById: string;
    ttlMinutes: number;
}

/**
 * Single-use, short-lived tokens behind an admin's "log in as" link. Kept
 * apart from `sessions` on purpose: a link is something that gets pasted into
 * chats and logged by proxies, so it must not be a session and must die on use.
 */
export interface ImpersonationRepository {
    insert(row: NewImpersonationToken): Promise<void>;
    /** The user an unused, unexpired `token` signs in as, without consuming it. */
    findLiveUserId(token: string): Promise<string | null>;
    /** Consumes `token` and returns its user; null when it is unknown, used or expired. */
    claim(token: string): Promise<string | null>;
}

const LIVE = `used_at is null and expires_at > (now() at time zone 'utc')`;

export function getImpersonationRepository({
    queryable
}: {
    queryable: Queryable;
}): ImpersonationRepository {
    return {
        async insert(row) {
            const sql = `
                insert into impersonation_tokens (token, user_id, created_by_id, expires_at, inserted_at)
                values ($1, $2, $3, (now() at time zone 'utc') + make_interval(mins => $4),
                        now() at time zone 'utc')`;
            await queryable.query(sql, [row.token, row.userId, row.createdById, row.ttlMinutes]);
        },

        async findLiveUserId(token) {
            const sql = `select user_id from impersonation_tokens where token = $1 and ${LIVE}`;
            return (await queryable.query<{ user_id: string }>(sql, [token]))[0]?.user_id ?? null;
        },

        async claim(token) {
            const sql = `
                update impersonation_tokens set used_at = now() at time zone 'utc'
                where token = $1 and ${LIVE}
                returning user_id`;
            return (await queryable.query<{ user_id: string }>(sql, [token]))[0]?.user_id ?? null;
        }
    };
}
