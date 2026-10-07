import type { OutgoingEmail } from '$lib/integrations/mail/mailer';

export const INVITATION_TTL_HOURS = 24;

/** The invitation email, word for word as `Backend.Mailer.send_invitation/3` sent it. */
export function invitationEmail(to: string, inviterEmail: string, link: string): OutgoingEmail {
    return {
        to,
        subject: 'Você foi convidado para criar eventos no Tickets',
        text: [
            'Olá!',
            '',
            `${inviterEmail} te convidou para se tornar criador de eventos no Tickets.`,
            '',
            'Abra o link abaixo para aceitar o convite e ativar o seu acesso de criador.',
            `O link expira em ${INVITATION_TTL_HOURS} horas.`,
            '',
            link,
            '',
            '— Equipe Tickets',
            ''
        ].join('\n')
    };
}
