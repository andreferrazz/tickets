import { normalizeBrazilianCellphone } from '$lib/utils/brazilian-cellphone';
import { isValidBrazilianTaxId } from '$lib/utils/brazilian-tax-id';

export interface ProfileInput {
    name: string;
    cellphone: string;
    taxId: string;
}

export type ProfileField = keyof ProfileInput;
export type ProfileFieldErrors = Partial<Record<ProfileField, string[]>>;

export type ProfileValidation =
    { ok: true; value: ProfileInput } | { ok: false; fieldErrors: ProfileFieldErrors };

// The messages are the ones Ecto produced for `User.profile_changeset/2`; the
// pages translate them by matching on this text.
const BLANK = "can't be blank";
const TOO_SHORT = 'should be at least 2 character(s)';
const TOO_LONG = 'should be at most 255 character(s)';
const BAD_TAX_ID = 'must be a valid CPF (11 digits) or CNPJ (14 digits)';
const BAD_CELLPHONE = 'must be a valid Brazilian mobile';
const NAME_MAX = 255;

/**
 * Trims the name, strips the tax id to digits, normalizes the cellphone and
 * checks each the way the Phoenix changeset did, so obvious typos never reach
 * Abacate Pay.
 *
 * @example
 * validateProfile({ name: ' Maria ', cellphone: '(11) 99999-9999', taxId: '390.533.447-05' });
 * // { ok: true, value: { name: 'Maria', cellphone: '11999999999', taxId: '39053344705' } }
 */
export function validateProfile(input: ProfileInput): ProfileValidation {
    const name = input.name.trim();
    const taxId = input.taxId.replace(/\D/g, '');
    const cellphone = normalizeBrazilianCellphone(input.cellphone);
    const fieldErrors: ProfileFieldErrors = {};
    if (!name) fieldErrors.name = [BLANK];
    else if (name.length < 2) fieldErrors.name = [TOO_SHORT];
    else if (name.length > NAME_MAX) fieldErrors.name = [TOO_LONG];
    if (!input.cellphone.trim()) fieldErrors.cellphone = [BLANK];
    else if (!cellphone) fieldErrors.cellphone = [BAD_CELLPHONE];
    if (!taxId) fieldErrors.taxId = [BLANK];
    else if (!isValidBrazilianTaxId(taxId)) fieldErrors.taxId = [BAD_TAX_ID];
    if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
    return { ok: true, value: { name, cellphone: cellphone as string, taxId } };
}
