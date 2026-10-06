import type { SmtpConfig } from '$lib/config/smtp';
import nodemailer from 'nodemailer';
import type { InlineImage, Mailer } from './mailer';

const SENDER_NAME = 'Tickets';

/**
 * Delivers mail over an authenticated SMTP relay with STARTTLS, the same relay
 * settings the Phoenix mailer used (backend/config/runtime.exs: tls :always,
 * verify_none, auth :always).
 *
 * @example
 * const mailer = getSmtpMailer(readSmtpConfig());
 * await mailer.send({ to, subject: 'Seu código', text: 'Código: 123456' });
 */
export function getSmtpMailer(config: SmtpConfig): Mailer {
    const transport = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: false,
        requireTLS: true,
        auth: { user: config.user, pass: config.pass },
        // Phoenix shipped with verify: :verify_none for this relay; kept so the
        // cutover changes no delivery behaviour. Tighten once the relay's
        // certificate chain is confirmed.
        tls: { rejectUnauthorized: false }
    });
    return {
        async send(email) {
            await transport.sendMail({
                from: { name: SENDER_NAME, address: config.from },
                to: email.to,
                subject: email.subject,
                text: email.text,
                html: email.html,
                attachments: (email.inlineImages ?? []).map(inlineAttachment)
            });
        }
    };
}

function inlineAttachment(image: InlineImage) {
    return {
        filename: image.filename,
        content: Buffer.from(image.content),
        contentType: image.contentType,
        cid: image.cid,
        contentDisposition: 'inline' as const
    };
}
