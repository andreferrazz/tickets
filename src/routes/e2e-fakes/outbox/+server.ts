import { error, json, type RequestHandler } from '@sveltejs/kit';

/**
 * Test-only: the mail the fake mailer "sent", optionally for one recipient.
 * Lets a spec follow the same link or code a person would get by email, and so
 * prove who it went to and what it said. `inlineImages` is how many QR codes
 * a pass email carried. Does not exist outside
 * `INTEGRATIONS=fake`, which is itself refused in production.
 */
export const GET: RequestHandler = ({ locals, url }) => {
    const fakes = locals.container.fakes;
    if (!fakes) error(404, 'not found');
    const recipient = url.searchParams.get('to');
    const emails = fakes.mailer.sent
        .filter((email) => !recipient || email.to === recipient)
        .map(({ to, subject, text, inlineImages }) => ({
            to,
            subject,
            text,
            inlineImages: inlineImages?.length ?? 0
        }));
    return json(emails);
};
