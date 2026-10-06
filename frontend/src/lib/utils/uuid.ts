const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether `value` can reach a uuid column. Postgres raises on a malformed one,
 * and a mistyped URL is a miss, not a failure, so services check this first.
 *
 * @example
 * if (!isUuid(params.id)) return null;
 */
export function isUuid(value: string): boolean {
    return UUID.test(value);
}
