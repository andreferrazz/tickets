/**
 * Formats a timestamp the way Phoenix's Jason encoder renders Ecto's
 * `:utc_datetime` — second precision, `Z` suffix, no fractional part. Keeping
 * the wire format byte-identical matters while some endpoints are still served
 * by Phoenix and some by this app.
 *
 * @example
 * toIso8601Utc(new Date('2026-05-13T01:00:17.482Z')); // '2026-05-13T01:00:17Z'
 */
export function toIso8601Utc(value: Date): string {
	if (Number.isNaN(value.getTime())) {
		throw new Error(`expected a valid Date, got an invalid one: ${String(value)}`);
	}
	return `${value.toISOString().slice(0, 19)}Z`;
}

/** Same as {@link toIso8601Utc}, but passes `null` through for nullable columns. */
export function toIso8601UtcOrNull(value: Date | null): string | null {
	return value === null ? null : toIso8601Utc(value);
}
