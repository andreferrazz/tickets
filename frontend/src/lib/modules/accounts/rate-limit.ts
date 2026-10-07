/**
 * Fixed-window rate limiter kept in process memory, as Phoenix's ETS-backed
 * `Backend.RateLimit` was. Windows are aligned to the clock (unix seconds
 * divided by the window length), so they reset at predictable boundaries.
 *
 * @example
 * const limiter = getFixedWindowRateLimiter();
 * limiter.check(`request_code:${ip}`, 60, 5); // { allowed: true, count: 1 }
 */
export interface RateLimitVerdict {
    allowed: boolean;
    count: number;
}

export interface RateLimiter {
    check(key: string, windowSeconds: number, maxRequests: number): RateLimitVerdict;
}

export function getFixedWindowRateLimiter(now: () => number = Date.now): RateLimiter {
    const counters = new Map<string, number>();
    let currentWindow = -1;

    return {
        check(key, windowSeconds, maxRequests) {
            const window = Math.floor(now() / 1000 / windowSeconds);
            // A new window starts from zero; dropping the old counters keeps the
            // map from growing with every address that ever called.
            if (window !== currentWindow) {
                counters.clear();
                currentWindow = window;
            }
            const count = (counters.get(key) ?? 0) + 1;
            counters.set(key, count);
            return { allowed: count <= maxRequests, count };
        }
    };
}
