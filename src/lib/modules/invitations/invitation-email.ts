import type { OutgoingEmail } from '$lib/integrations/mail/mailer';

export const INVITATION_TTL_HOURS = 24;

/** The invitation email, as `Backend.Mailer.send_invitation/3` sent it, naming the organization. */
export function invitationEmail(
    to: string,
    inviterEmail: string,
    link: string,
    organizationName: string
): OutgoingEmail {
    return {
        to,
        subject: `Você foi convidado para a equipe de ${organizationName}`,
        text: [
            'Olá!',
            '',
            `${inviterEmail} te convidou para a equipe de ${organizationName}.`,
            '',
            'Abra o link abaixo para aceitar o convite e ativar o seu acesso.',
            `O link expira em ${INVITATION_TTL_HOURS} horas.`,
            '',
            link,
            '',
            `— ${organizationName}`,
            ''
        ].join('\n')
    };
}
