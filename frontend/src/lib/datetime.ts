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
