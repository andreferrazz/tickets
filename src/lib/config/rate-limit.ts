import { env } from '$env/dynamic/private';

export interface RateLimitConfig {
    /** Login code requests allowed per address per minute. */
    requestCodePerMinute: number;
    /** Guesses allowed per email while one code is alive (ten minutes). */
    verifyAttemptsPerCode: number;
}

const DEFAULT_REQUEST_CODE_PER_MINUTE = 5;
const DEFAULT_VERIFY_ATTEMPTS_PER_CODE = 5;

/**
 * How hard the login endpoints are throttled. Five code requests per minute
 * per address is what Phoenix enforced; the e2e server raises it because a
 * suite requests more codes in a minute than any person would. Phoenix never
 * limited guesses at a code, which left a six-digit code open to brute force.
 */
export function readRateLimitConfig(): RateLimitConfig {
    return {
        requestCodePerMinute: positiveInt('AUTH_CODE_RATE_LIMIT', DEFAULT_REQUEST_CODE_PER_MINUTE),
        verifyAttemptsPerCode: positiveInt(
            'AUTH_VERIFY_ATTEMPT_LIMIT',
            DEFAULT_VERIFY_ATTEMPTS_PER_CODE
        )
    };
}

function positiveInt(name: string, fallback: number): number {
    const raw = env[name];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer, got: ${raw}`);
    }
    return value;
}
