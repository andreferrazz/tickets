export const APP_TIMEZONE = 'America/Sao_Paulo';

export function formatDateTime(iso: string): string {
	return new Date(iso).toLocaleString('pt-BR', {
		timeZone: APP_TIMEZONE,
		dateStyle: 'medium',
		timeStyle: 'short'
	});
}

export function toLocalInputValue(iso: string): string {
	const parts = new Date(iso).toLocaleString('sv-SE', {
		timeZone: APP_TIMEZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	});
	return parts.replace(' ', 'T').slice(0, 16);
}

// São Paulo has no DST since 2019, so a fixed -03:00 offset is correct year-round.
// `Date` only accepts numeric offsets in its constructor, not IANA names.
export function fromLocalInputValue(value: string): string {
	return new Date(`${value}:00-03:00`).toISOString();
}

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