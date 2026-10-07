// Deliberately loose, as Phoenix's `~r/@/` was: something on each side of one
// "@" and no whitespace. Real validation is the code or link we mail there.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;

/**
 * Whether `value` could be an email address at all.
 *
 * @example
 * isEmailAddress('maria@exemplo.com'); // true
 * isEmailAddress('maria');             // false
 */
export function isEmailAddress(value: string): boolean {
    return EMAIL_SHAPE.test(value);
}
