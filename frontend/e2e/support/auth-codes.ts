import { queryValue } from './sql';

/**
 * The code the app just emailed to `email`, read from the table it was stored
 * in. The fake mailer keeps mail in memory on the server, out of a spec's
 * reach, but the row is the same thing the email carries.
 */
export async function latestAuthCode(email: string): Promise<string> {
    const code = await queryValue<string>(
        'select code from auth_codes where email = $1 order by inserted_at desc limit 1',
        [email]
    );
    if (!code) throw new Error(`no auth code stored for ${email}`);
    return code;
}

/** One column of the `users` row for `email`, for asserting what a flow persisted. */
export function userColumn(email: string, column: string): Promise<string | null> {
    return queryValue<string>(`select ${column}::text from users where email = $1`, [email]);
}
