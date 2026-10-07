// What is left of the Phoenix client: nothing calls Phoenix any more, and the
// one helper the pages still import from here moves out when the file goes
// (step 15 of the migration).
export function formatBRL(cents: number): string {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
