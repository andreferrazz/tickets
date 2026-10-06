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
