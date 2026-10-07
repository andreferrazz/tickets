import { t } from '$lib/i18n';

/**
 * What the login step tells the user for a failure code from the request
 * action. The server answers with codes; the wording lives here, shared by the
 * login page and the login modal.
 */
export function loginFailureMessage(code: string | null | undefined): string {
    if (code === 'rate_limited') return t('auth.login.rateLimited');
    if (code === 'invalid_email' || code === 'email_required') return t('auth.login.invalidEmail');
    return t('auth.login.errorFallback');
}

/** The same for the code step and the verify action. */
export function verifyFailureMessage(code: string | null | undefined): string {
    if (code === 'invalid_code') return t('auth.verify.invalidCode');
    if (code === 'rate_limited') return t('auth.verify.rateLimited');
    return t('auth.verify.errorFallback');
}
