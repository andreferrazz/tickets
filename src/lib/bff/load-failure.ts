/**
 * Logs a load that failed, in the one shape every BFF uses, so the page can
 * show its own error state while the cause stays findable in the logs.
 *
 * @example
 * logLoadFailure('dashboard_load_failed', { eventId }, cause);
 */
export function logLoadFailure(
    event: string,
    context: Record<string, string>,
    cause: unknown
): void {
    console.error(JSON.stringify({ level: 'error', event, ...context, error: String(cause) }));
}
