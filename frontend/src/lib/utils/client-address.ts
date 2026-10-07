/**
 * The caller's address for rate limiting. Behind a proxy without
 * `ADDRESS_HEADER` configured, or in a test runner, SvelteKit may have none
 * and throws; one shared bucket is safer than skipping the limit.
 *
 * @example
 * const address = clientAddressOf(event.getClientAddress);
 */
export function clientAddressOf(read: () => string): string {
    try {
        return read();
    } catch {
        return 'unknown';
    }
}
