// Validates a `next` redirect target. Only same-origin relative paths are
// allowed to prevent open-redirect attacks via crafted login links.
export function safeNext(raw: string | null | undefined): string | null {
	if (!raw) return null;
	if (!raw.startsWith('/')) return null;
	if (raw.startsWith('//')) return null;
	if (raw.startsWith('/\\')) return null;
	return raw;
}
