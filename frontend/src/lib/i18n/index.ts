import { pt, type TranslationKey } from './pt';

/** Translate a key, interpolating {var} placeholders with `params`. */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
	let str: string = pt[key];
	if (params) {
		for (const [k, v] of Object.entries(params)) {
			str = str.replaceAll(`{${k}}`, String(v));
		}
	}
	return str;
}

/** Translate an event/order status value to pt-BR. */
export function tStatus(status: string): string {
	const map: Record<string, TranslationKey> = {
		draft: 'status.draft',
		published: 'status.published',
		cancelled: 'status.cancelled',
		pending: 'status.pending',
		paid: 'status.paid',
		expired: 'status.expired',
		refunded: 'status.refunded',
		accepted: 'status.accepted',
	};
	const key = map[status];
	return key ? pt[key] : status;
}
