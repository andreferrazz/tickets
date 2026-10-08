import type { Queryable } from '$lib/db/queryable';

export interface AuthCodeRepository {
    /** Drops every unused code for `email` and stores `code`, valid for `ttlMinutes`. */
    replacePending(email: string, code: string, ttlMinutes: number): Promise<void>;

    /**
     * Marks an unused, unexpired `code` for `email` as used and says whether
     * there was one. One statement, so two requests racing with the same code
     * cannot both win.
     */
    claim(email: string, code: string): Promise<boolean>;
}

export function getAuthCodeRepository({ queryable }: { queryable: Queryable }): AuthCodeRepository {
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

        async claim(email, code) {
            const sql = `
                update auth_codes set used = true
                where email = $1 and code = $2 and used = false
                  and expires_at > (now() at time zone 'utc')
                returning id`;
            return (await queryable.query<{ id: string }>(sql, [email, code])).length > 0;
        }
    };
}
