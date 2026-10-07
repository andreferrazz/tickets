/** The shape `use:enhance` hands the login steps after a page action settles. */
export type LoginActionResult = { type: string; data?: Record<string, unknown> };

/**
 * The banner text for a failed login-step action: the `error` the page action
 * returned, or the step's own fallback when it returned none.
 *
 * Example: `failureText(result.data, t('auth.login.errorFallback'))`
 */
export function failureText(data: Record<string, unknown> | undefined, fallback: string): string {
    return typeof data?.error === 'string' ? data.error : fallback;
}
