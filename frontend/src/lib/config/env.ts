import { env } from '$env/dynamic/private';

/**
 * Reads a private environment variable that the live integrations cannot run
 * without. The error names the variable and the shape expected, so a bad
 * deploy fails at boot with something actionable.
 *
 * @example
 * const apiKey = requireEnv('ABACATE_PAY_API_KEY', 'the seller API key from the Abacate Pay dashboard');
 */
export function requireEnv(name: string, expected: string): string {
    const value = env[name];
    if (!value) {
        throw new Error(`environment variable ${name} is required (${expected}), got: (unset)`);
    }
    return value;
}
