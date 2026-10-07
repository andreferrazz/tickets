/**
 * Normalizes a Brazilian mobile number typed in any format to DDD + number
 * (11 digits, no country code), which is what Abacate Pay expects. Only
 * mobiles pass: after an optional country code there must be exactly 11 digits
 * with the mobile `9` right after the DDD. Ported from
 * backend/lib/backend/brazilian_cellphone.ex.
 *
 * @example
 * normalizeBrazilianCellphone('+55 (11) 99999-9999'); // '11999999999'
 * normalizeBrazilianCellphone('11 3333-4444');        // null (landline)
 */
export function normalizeBrazilianCellphone(input: string): string | null {
    const digits = stripCountryCode(input.replace(/\D/g, ''));
    return /^[1-9]\d9\d{8}$/.test(digits) ? digits : null;
}

function stripCountryCode(digits: string): string {
    return digits.startsWith('55') && digits.length === 13 ? digits.slice(2) : digits;
}
