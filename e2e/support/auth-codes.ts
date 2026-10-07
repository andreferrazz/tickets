import { latestEmail } from './outbox';
import { queryValue } from './sql';

/** The six-digit code in the login email the app just sent to `email`. */
export async function latestAuthCode(email: string): Promise<string> {
    const { subject } = await latestEmail(email);
    const code = subject.match(/\b(\d{6})\b/)?.[1];
    if (!code) throw new Error(`no login code in the subject of the email to ${email}: ${subject}`);
    return code;
}

const USER_COLUMNS = ['role', 'abacate_customer_id', 'name'] as const;

/** One column of the `users` row for `email`, for asserting what a flow persisted. */
export function userColumn(
    email: string,
    column: (typeof USER_COLUMNS)[number]
): Promise<string | null> {
    return queryValue<string>(`select ${column}::text from users where email = $1`, [email]);
}
