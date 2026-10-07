// CPF (11 digits) and CNPJ (14 digits) carry two check digits computed from the
// leading digits by a weighted sum modulo 11. Validating locally rejects typos
// and all-same-digit values before any payment-provider call. Ported from
// backend/lib/backend/brazilian_tax_id.ex.
const CPF_WEIGHTS_1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
const CPF_WEIGHTS_2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_WEIGHTS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/**
 * Whether `digits` (digits only) is a checksum-valid CPF or CNPJ.
 *
 * @example
 * isValidBrazilianTaxId('39053344705'); // true
 * isValidBrazilianTaxId('11111111111'); // false
 */
export function isValidBrazilianTaxId(digits: string): boolean {
    if (!/^\d+$/.test(digits) || allSameDigits(digits)) return false;
    if (digits.length === 11) return checkDigitsMatch(digits, CPF_WEIGHTS_1, CPF_WEIGHTS_2);
    if (digits.length === 14) return checkDigitsMatch(digits, CNPJ_WEIGHTS_1, CNPJ_WEIGHTS_2);
    return false;
}

function allSameDigits(digits: string): boolean {
    return digits.split('').every((digit) => digit === digits[0]);
}

function checkDigitsMatch(digits: string, weights1: number[], weights2: number[]): boolean {
    const numbers = digits.split('').map(Number);
    const body = numbers.slice(0, weights1.length);
    const [d1, d2] = numbers.slice(-2);
    return d1 === checksum(body, weights1) && d2 === checksum([...body, d1], weights2);
}

function checksum(numbers: number[], weights: number[]): number {
    const sum = numbers.reduce((acc, n, i) => acc + n * weights[i], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
}
