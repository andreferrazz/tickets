import { env } from '$env/dynamic/private';

export interface RateLimitConfig {
    /** Login code requests allowed per address per minute. */
    requestCodePerMinute: number;
}

const DEFAULT_REQUEST_CODE_PER_MINUTE = 5;

/**
 * How hard the login code endpoint is throttled. Five per minute per address
 * is what Phoenix enforced; the e2e server raises it because a suite requests
 * more codes in a minute than any person would.
 */
export function readRateLimitConfig(): RateLimitConfig {
    const raw = env.AUTH_CODE_RATE_LIMIT;
    if (raw === undefined || raw === '')
        return { requestCodePerMinute: DEFAULT_REQUEST_CODE_PER_MINUTE };
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`AUTH_CODE_RATE_LIMIT must be a positive integer, got: ${raw}`);
    }
    return { requestCodePerMinute: value };
}
