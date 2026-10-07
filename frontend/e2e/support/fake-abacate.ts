import { E2E_BASE_URL } from './base-url';

/**
 * Plays the buyer paying: from now on the fake Abacate Pay reports checkout
 * `id` as paid by Pix. The app only learns of it when it next asks, as it does
 * before cancelling a pending order.
 */
export async function payAtFakeAbacate(id: string): Promise<void> {
    const response = await fetch(`${E2E_BASE_URL}/e2e-fakes/abacate-pay/settle`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, status: 'paid', paymentMethod: 'PIX' })
    });
    if (!response.ok) throw new Error(`settle answered ${response.status}; is INTEGRATIONS=fake?`);
}
