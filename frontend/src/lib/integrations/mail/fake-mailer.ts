import type { Mailer, OutgoingEmail } from './mailer';

/**
 * Keeps every email in memory instead of sending it. The e2e suite reads the
 * outbox to follow auth codes and ticket links; local development uses it the
 * way Phoenix used the Swoosh local mailbox.
 *
 * @example
 * const mailer = getFakeMailer();
 * await mailer.send(email);
 * mailer.sent[0].subject; // what would have gone out
 */
export interface FakeMailer extends Mailer {
    readonly sent: readonly OutgoingEmail[];
}

export function getFakeMailer(): FakeMailer {
    const sent: OutgoingEmail[] = [];
    return {
        sent,
        async send(email) {
            sent.push(email);
            console.log(
                JSON.stringify({
                    level: 'info',
                    event: 'fake_mailer.sent',
                    to: email.to,
                    subject: email.subject
                })
            );
        }
    };
}
