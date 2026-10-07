import { expect, test } from '@playwright/test';
import { latestAuthCode, userColumn } from './support/auth-codes';
import { PUBLISHED_EVENT } from './support/fixtures';
import { waitForHydration } from './support/hydration';
import { completeProfile, fakeCustomerId, VALID_CPF } from './support/profile';
import { uniqueEmail } from './support/unique';

// The modal posts to the same three actions as the login pages, so this covers
// the in-page flow: a visitor who is not signed in presses "buy" and ends up
// signed in with a complete profile without ever leaving the event.
test('a visitor signs in and completes their profile inside the login modal', async ({ page }) => {
    const email = uniqueEmail('modal-buyer');
    await page.goto(`/events/${PUBLISHED_EVENT.id}`);
    await waitForHydration(page);

    await page.getByRole('button', { name: '+' }).first().click();
    await page.getByRole('button', { name: 'Comprar' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    await dialog.getByLabel('E-mail').fill(email);
    await dialog.getByRole('button', { name: 'Enviar código' }).click();

    await expect(dialog.getByText(email)).toBeVisible();
    // "Change email" brings the typed address back rather than a blank field.
    await dialog.getByRole('button', { name: 'Alterar e-mail' }).click();
    await expect(dialog.getByLabel('E-mail')).toHaveValue(email);
    await dialog.getByRole('button', { name: 'Enviar código' }).click();

    await dialog.getByLabel('Código de 6 dígitos').fill(await latestAuthCode(email));
    await dialog.getByRole('button', { name: 'Verificar' }).click();

    await expect(dialog.getByRole('heading', { name: 'Complete seu cadastro' })).toBeVisible();
    await completeProfile(dialog);

    await expect(page.getByRole('heading', { name: 'Complete seu cadastro' })).toHaveCount(0);
    expect(await userColumn(email, 'abacate_customer_id')).toBe(fakeCustomerId(VALID_CPF));
    // The cookie set by the verify action is what the server trusts.
    expect((await page.request.get('/orders')).status()).toBe(200);
});
