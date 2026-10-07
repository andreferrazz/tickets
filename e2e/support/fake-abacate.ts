import { E2E_BASE_URL } from './base-url';

async function post(path: string, body: unknown): Promise<Response> {
    const response = await fetch(`${E2E_BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`${path} answered ${response.status}; is INTEGRATIONS=fake?`);
    return response;
}

/**
 * Plays the buyer paying: from now on the fake Abacate Pay reports checkout
 * `id` as paid by Pix. The app only learns of it when it next asks, as it does
 * before cancelling a pending order and when the reconciler sweeps.
 */
export async function payAtFakeAbacate(id: string): Promise<void> {
    await post('/e2e-fakes/abacate-pay/settle', { id, status: 'paid', paymentMethod: 'PIX' });
}

/** Plays an outage: every later status check of `id` fails. */
export async function cutOffFakeAbacate(id: string): Promise<void> {
    await post('/e2e-fakes/abacate-pay/settle', { id, unreachable: true });
}

/**
 * Runs the stale-order sweep now rather than on its ten-minute timer. It
 * sweeps every stale order in the database, other tests' included, so assert
 * on the order, not on the counts this returns.
 */
export async function runReconciler(): Promise<void> {
    await post('/e2e-fakes/reconcile', {});
}
