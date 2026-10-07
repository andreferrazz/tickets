import type { Locator, Page } from '@playwright/test';

/** Checksum-valid CPFs; a spec that asserts on the customer id picks its own. */
export const VALID_CPF = '390.533.447-05';

/** The customer id the fake Abacate Pay hands out for a tax id. */
export function fakeCustomerId(cpf: string): string {
    return `cust_fake_${cpf.replace(/\D/g, '')}`;
}

/** Fills and submits the profile step, on the page or inside the login modal. */
export async function completeProfile(scope: Page | Locator, cpf = VALID_CPF): Promise<void> {
    await scope.getByLabel('Nome completo').fill('E2E Pessoa Nova');
    await scope.getByLabel('Celular').fill('(11) 99999-9999');
    await scope.getByLabel('CPF ou CNPJ').fill(cpf);
    await scope.getByRole('button', { name: 'Salvar e continuar' }).click();
}
