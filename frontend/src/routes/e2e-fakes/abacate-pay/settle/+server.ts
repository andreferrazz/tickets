import { error, json, type RequestHandler } from '@sveltejs/kit';
import type { PaymentState } from '$lib/integrations/abacate-pay/gateway';

/**
 * Test-only: decides what the fake Abacate Pay reports for one checkout from
 * now on, which is how a spec plays the buyer paying (or a payment expiring)
 * without a provider. `"unreachable": true` instead makes every later status
 * check of it fail, as an Abacate Pay outage would. Does not exist outside `INTEGRATIONS=fake`, which is
 * itself refused in production.
 *
 * @example
 * POST /e2e-fakes/abacate-pay/settle  { "id": "bill_fake_1a2b3c4d_000001", "status": "paid", "paymentMethod": "PIX" }
 */
export const POST: RequestHandler = async ({ locals, request }) => {
    const fakes = locals.container.fakes;
    if (!fakes) error(404, 'not found');
    const body = (await request.json()) as { id?: unknown; unreachable?: boolean };
    const { id, unreachable, ...state } = body as typeof body & Partial<PaymentState>;
    if (typeof id !== 'string' || id === '') {
        error(
            422,
            `expected body { id: string, status?, paymentMethod? }, got id: ${JSON.stringify(id)}`
        );
    }
    if (unreachable) fakes.abacatePay.cutOff(id);
    else fakes.abacatePay.settle(id, state);
    return json({ settled: id });
};
