const STATUS_BY_FAILURE: Record<string, number> = {
    not_found: 404,
    event_not_found: 404,
    forbidden: 403,
    rate_limited: 429,
    abacate_unavailable: 502,
    batch_has_sales: 409,
    section_not_empty: 409,
    already_invited: 409,
    already_member: 409,
    out_of_stock: 409,
    already_paid: 409,
    payment_check_failed: 502
};

/**
 * The HTTP status a form action answers with for a failure code. Anything not
 * listed is the caller's input being wrong: 422.
 *
 * @example
 * return fail(statusForFailure(result.failure), { error: result.failure });
 */
export function statusForFailure(failure: string): number {
    return STATUS_BY_FAILURE[failure] ?? 422;
}
