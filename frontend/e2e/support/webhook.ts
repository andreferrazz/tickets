import { signWebhookBody } from '../../src/lib/integrations/abacate-pay/webhook-signature.ts';
import { E2E_BASE_URL } from './base-url';

/** The per-seller URL secret the e2e server is started with (`playwright.config.ts`). */
export const E2E_WEBHOOK_SECRET = 'e2e-webhook-secret';

export interface DeliveryOverrides {
    /** Sent as `?webhookSecret=`; null leaves the parameter out. */
    secret?: string | null;
    /** Sent instead of the real signature of the body. */
    signature?: string;
}

/**
 * Delivers a webhook the way Abacate Pay does: the secret in the URL and an
 * HMAC of the exact body in `x-webhook-signature`, made with the app's own
 * signing function. Returns the HTTP status. `body` may be a raw string, for
 * the delivery that is not JSON at all.
 *
 * @example
 * expect(await deliverWebhook(checkoutCompleted(order.checkoutId))).toBe(200);
 */
export async function deliverWebhook(
    body: unknown,
    overrides: DeliveryOverrides = {}
): Promise<number> {
    const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
    const secret = overrides.secret === undefined ? E2E_WEBHOOK_SECRET : overrides.secret;
    const query = secret === null ? '' : `?webhookSecret=${encodeURIComponent(secret)}`;
    const response = await fetch(`${E2E_BASE_URL}/webhooks/abacate-pay${query}`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-webhook-signature': overrides.signature ?? signWebhookBody(rawBody)
        },
        body: rawBody
    });
    return response.status;
}

/** `checkout.completed` as Abacate Pay sends it; `checkout` and `payer` add its optional fields. */
export function checkoutCompleted(
    checkoutId: string | null,
    checkout: Record<string, unknown> = {},
    method = 'PIX'
): unknown {
    return {
        event: 'checkout.completed',
        data: { checkout: { id: checkoutId, ...checkout }, payerInformation: { method } }
    };
}

export function checkoutRefunded(checkoutId: string | null): unknown {
    return { event: 'checkout.refunded', data: { checkout: { id: checkoutId } } };
}
