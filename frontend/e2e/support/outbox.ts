import { E2E_BASE_URL } from './base-url';

export interface SentEmail {
    to: string;
    subject: string;
    text: string;
}

/**
 * The newest email the app sent to `to`, read from the fake mailer through its
 * test-only route. Following the mail, rather than the database row behind it,
 * is what proves the right person was told the right thing.
 */
export async function latestEmail(to: string): Promise<SentEmail> {
    const response = await fetch(`${E2E_BASE_URL}/e2e-fakes/outbox?to=${encodeURIComponent(to)}`);
    if (!response.ok) throw new Error(`outbox answered ${response.status}; is INTEGRATIONS=fake?`);
    const emails = (await response.json()) as SentEmail[];
    const newest = emails.at(-1);
    if (!newest) throw new Error(`no email was sent to ${to}`);
    return newest;
}
