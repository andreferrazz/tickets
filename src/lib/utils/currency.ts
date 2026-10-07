/**
 * Cents as Brazilian reais, the way every price on the site is shown.
 *
 * @example
 * formatBRL(1250); // 'R$ 12,50'
 */
export function formatBRL(cents: number): string {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatCentsInput(cents: number): string {
    const c = Math.max(0, Math.trunc(cents));
    return (c / 100).toFixed(2);
}

export function parseCentsInput(value: string): number {
    const digits = value.replace(/\D/g, '');
    if (!digits) return 0;
    return Number(digits);
}
