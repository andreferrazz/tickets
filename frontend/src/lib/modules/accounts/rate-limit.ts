/**
 * Fixed-window rate limiter kept in process memory, as Phoenix's ETS-backed
 * `Backend.RateLimit` was. Windows are aligned to the clock (unix seconds
 * divided by the window length), so they reset at predictable boundaries.
 * Each key keeps its own window, so limits of different lengths can share one
 * limiter.
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

interface Counter {
    window: number;
    count: number;
    windowSeconds: number;
}

// Past this many keys the stale ones are swept, so the map cannot grow with
// every address that ever called.
const SWEEP_THRESHOLD = 10_000;

export function getFixedWindowRateLimiter(now: () => number = Date.now): RateLimiter {
    const counters = new Map<string, Counter>();
    const windowOf = (windowSeconds: number) => Math.floor(now() / 1000 / windowSeconds);

    function sweep(): void {
        for (const [key, counter] of counters) {
            if (counter.window !== windowOf(counter.windowSeconds)) counters.delete(key);
        }
    }

    return {
        check(key, windowSeconds, maxRequests) {
            if (counters.size > SWEEP_THRESHOLD) sweep();
            const window = windowOf(windowSeconds);
            const previous = counters.get(key);
            const count = previous?.window === window ? previous.count + 1 : 1;
            counters.set(key, { window, count, windowSeconds });
            return { allowed: count <= maxRequests, count };
        }
    };
}
