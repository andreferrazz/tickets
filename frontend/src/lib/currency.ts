export function formatCentsInput(cents: number): string {
	const c = Math.max(0, Math.trunc(cents));
	return (c / 100).toFixed(2);
}

export function parseCentsInput(value: string): number {
	const digits = value.replace(/\D/g, '');
	if (!digits) return 0;
	return Number(digits);
}
