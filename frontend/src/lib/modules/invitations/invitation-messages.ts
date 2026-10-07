import { t } from '$lib/i18n';

/** What the inviter is told for a failure code from an invite action. */
export function inviteFailureMessage(code: string): string {
    if (code === 'already_invited') return t('invitations.alreadyInvited');
    if (code === 'already_member') return t('invitations.alreadyMember');
    if (code === 'invalid_email' || code === 'email_required') return t('auth.login.invalidEmail');
    return t('invitations.sendErrorFallback');
}
