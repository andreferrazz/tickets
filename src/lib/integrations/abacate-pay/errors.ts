/**
 * How an Abacate Pay call failed, so callers can decide what to do:
 * `invalid_data` is our input (surface it), `rate_limited` is a payout
 * throttle (tell the user to wait), `upstream` and `transport` are Abacate or
 * the network (retry later).
 */
export type AbacatePayFailure = 'invalid_data' | 'rate_limited' | 'upstream' | 'transport';

export class AbacatePayError extends Error {
    constructor(
        readonly failure: AbacatePayFailure,
        /** HTTP status when there was a response, null for transport failures. */
        readonly status: number | null,
        message: string,
        options?: ErrorOptions
    ) {
        super(message, options);
        this.name = 'AbacatePayError';
    }
}

/**
 * What is safe to log about a failed Abacate Pay call: the kind and status,
 * never the message, which can echo the name, tax id or phone we sent.
 *
 * @example
 * console.warn(JSON.stringify({ event: 'abacate_customer_create_failed', ...describeAbacateFailure(cause) }));
 */
export function describeAbacateFailure(cause: unknown): { failure: string; status: number | null } {
    if (cause instanceof AbacatePayError) return { failure: cause.failure, status: cause.status };
    return { failure: 'unexpected', status: null };
}
