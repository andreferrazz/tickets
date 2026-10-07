import { t } from '$lib/i18n';
import type { ProfileField, ProfileFieldErrors } from './profile-validation';

/**
 * The user-facing text for a profile validation message. The messages are
 * matched on their English wording because that is what the Phoenix changeset
 * produced and the login modal and profile page both translate them.
 */
export function profileFieldError(
    fieldErrors: ProfileFieldErrors | undefined,
    field: ProfileField
): string | null {
    const message = fieldErrors?.[field]?.[0];
    if (!message) return null;
    if (message === "can't be blank") return t('auth.profile.fieldRequired');
    if (message.includes('at least')) return t('auth.profile.fieldTooShort');
    if (message.includes('at most')) return t('auth.profile.fieldTooLong');
    if (field === 'taxId') return t('auth.profile.fieldInvalidTaxId');
    if (field === 'cellphone') return t('auth.profile.fieldInvalidCellphone');
    return message;
}

/** The banner text for a failure that is not about one field. */
export function profileFailureMessage(failure: string): string {
    if (failure === 'abacate_unavailable') return t('auth.profile.errorUnavailable');
    if (failure === 'invalid_profile_data') return t('auth.profile.errorInvalidData');
    return t('auth.profile.errorFallback');
}
