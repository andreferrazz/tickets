import type { Queryable } from '$lib/db/queryable';

export interface AuthCodeRepository {
    /** Drops every unused code for `email` and stores `code`, valid for `ttlMinutes`. */
    replacePending(email: string, code: string, ttlMinutes: number): Promise<void>;

    /** The id of an unused, unexpired `code` for `email`, or null. */
    findValid(email: string, code: string): Promise<string | null>;

    markUsed(id: string): Promise<void>;
}

export function getAuthCodeRepository(queryable: Queryable): AuthCodeRepository {
    return {
        replacePending(email, code, ttlMinutes) {
            return queryable.transaction(async (tx) => {
                await tx.query(`delete from auth_codes where email = $1 and used = false`, [email]);
                await tx.query(
                    `insert into auth_codes (email, code, expires_at, used, inserted_at)
                     values ($1, $2, (now() at time zone 'utc') + make_interval(mins => $3), false,
                             now() at time zone 'utc')`,
                    [email, code, ttlMinutes]
                );
            });
        },

        async findValid(email, code) {
            const sql = `
                select id from auth_codes
                where email = $1 and code = $2 and used = false
                  and expires_at > (now() at time zone 'utc')`;
            const rows = await queryable.query<{ id: string }>(sql, [email, code]);
            return rows[0]?.id ?? null;
        },

        async markUsed(id) {
            await queryable.query(`update auth_codes set used = true where id = $1`, [id]);
        }
    };
}
