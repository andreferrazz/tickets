import { requireEnv } from './env';

export interface SmtpConfig {
    host: string;
    port: number;
    user: string;
    pass: string;
    /** The address transactional mail is sent from. */
    from: string;
}

/** Settings the SMTP mailer needs; only read when INTEGRATIONS=live. */
export function readSmtpConfig(): SmtpConfig {
    const rawPort = requireEnv('SMTP_PORT', 'a TCP port such as 587');
    const port = Number(rawPort);
    if (!Number.isInteger(port) || port <= 0) {
        throw new Error(`SMTP_PORT must be a positive integer, got: ${rawPort}`);
    }
    return {
        host: requireEnv('SMTP_HOST', 'the SMTP relay hostname'),
        port,
        user: requireEnv('SMTP_USER', 'the SMTP login'),
        pass: requireEnv('SMTP_PASS', 'the SMTP password'),
        from: requireEnv('MAIL_FROM', 'the sender address, e.g. tickets@example.com')
    };
}
