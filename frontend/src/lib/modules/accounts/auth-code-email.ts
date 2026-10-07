import type { OutgoingEmail } from '$lib/integrations/mail/mailer';

const CODE_TTL_MINUTES = 10;

/** The passwordless login email, word for word as `Backend.Mailer.send_auth_code/2` sent it. */
export function authCodeEmail(to: string, code: string): OutgoingEmail {
    return {
        to,
        subject: `Seu código de acesso: ${code}`,
        text: [
            'Olá!',
            '',
            `Seu código de acesso ao Tickets é: ${code}`,
            '',
            `O código expira em ${CODE_TTL_MINUTES} minutos. Não compartilhe com ninguém.`,
            '',
            '— Equipe Tickets',
            ''
        ].join('\n')
    };
}

export { CODE_TTL_MINUTES };
