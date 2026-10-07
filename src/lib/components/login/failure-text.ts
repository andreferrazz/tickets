/** The shape `use:enhance` hands the login steps after a page action settles. */
export type LoginActionResult = { type: string; data?: Record<string, unknown> };

/**
 * The failure code a page action answered with, if it gave one.
 *
 * @example
 * error = loginFailureMessage(failureCode(result.data));
 */
export function failureCode(payload: Record<string, unknown> | undefined): string | null {
    return typeof payload?.error === 'string' ? payload.error : null;
}
