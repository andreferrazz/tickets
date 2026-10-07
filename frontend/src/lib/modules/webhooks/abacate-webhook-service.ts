import {
    readPaymentNotice,
    type PaymentNotice
} from '$lib/integrations/abacate-pay/webhook-notice';
import { secretsMatch, signWebhookBody } from '$lib/integrations/abacate-pay/webhook-signature';
import type { OrderSettlement } from '$lib/modules/orders/settlement-service';
import type { WebhookLogRepository } from './webhook-log-repository';

export interface WebhookDelivery {
    /** The body exactly as received; the signature covers these bytes. */
    rawBody: string;
    /** `?webhookSecret=` from the URL. */
    urlSecret: string;
    /** The `x-webhook-signature` header. */
    signature: string;
    /** The site's own origin, for the order link in the emails a payment sends. */
    origin: string;
}

export interface WebhookAnswer {
    status: 200 | 400 | 401 | 404;
    body: { ok: true } | { error: string };
}

/**
 * Receives a payment event from Abacate Pay, as `WebhookController` did, with
 * its two layers of proof: the per-seller secret in the URL, then an HMAC of
 * the raw body. A delivery that passes both is logged, then acted on.
 *
 * @example
 * const answer = await abacateWebhook.receive({ rawBody, urlSecret, signature, origin });
 * return json(answer.body, { status: answer.status });
 */
export interface AbacateWebhook {
    receive(delivery: WebhookDelivery): Promise<WebhookAnswer>;
}

export interface AbacateWebhookDeps {
    /** Empty when the server has none configured; every delivery is then refused. */
    secret: string;
    log: WebhookLogRepository;
    settlement: OrderSettlement;
}

const refuse = (status: 400 | 401 | 404, error: string): WebhookAnswer => ({
    status,
    body: { error }
});

export function getAbacateWebhook(deps: AbacateWebhookDeps): AbacateWebhook {
    const act = (notice: PaymentNotice, origin: string) => {
        if (notice.kind === 'paid')
            return deps.settlement.paid(notice.checkoutId, notice.payment, origin);
        if (notice.kind === 'refunded') return deps.settlement.refunded(notice.checkoutId);
        return 'settled' as const;
    };

    return {
        async receive({ rawBody, urlSecret, signature, origin }) {
            if (!secretsMatch(deps.secret, urlSecret)) return refuse(401, 'unauthorized');
            if (!secretsMatch(signWebhookBody(rawBody), signature))
                return refuse(401, 'invalid signature');
            const payload = parseJson(rawBody);
            if (payload === undefined) return refuse(400, 'body is not JSON');
            await deps.log.record(eventType(payload), payload);
            const outcome = await act(readPaymentNotice(payload), origin);
            // A 404 makes Abacate Pay retry, which is right for a payment that
            // outran the order's own checkout id being stored.
            if (outcome === 'not_found') return refuse(404, 'order not found');
            return { status: 200, body: { ok: true } };
        }
    };
}

function parseJson(rawBody: string): unknown {
    try {
        return JSON.parse(rawBody);
    } catch {
        return undefined;
    }
}

function eventType(payload: unknown): string | null {
    const event = (payload as { event?: unknown } | null)?.event;
    return typeof event === 'string' ? event : null;
}
