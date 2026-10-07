import type { SettledPaymentMethod } from './gateway';

export interface NoticedPayment {
    paymentMethod: SettledPaymentMethod | null;
    cardInstallments: number | null;
    /** Abacate's own figure for its fee on this payment, in cents. */
    platformFeeCents: number | null;
}

/**
 * What a webhook from Abacate Pay asks of us. Everything we do not act on,
 * including events they add later, is `ignored`: it is still logged and
 * answered with a 200 so they do not retry it forever.
 */
export type PaymentNotice =
    | { kind: 'paid'; checkoutId: string; payment: NoticedPayment }
    | { kind: 'refunded'; checkoutId: string }
    | { kind: 'ignored' };

type Json = Record<string, unknown>;

const IGNORED: PaymentNotice = { kind: 'ignored' };

/**
 * Reads a verified webhook payload, as `WebhookController.dispatch_event/1`
 * matched it. Hosted checkouts (Pix, card) arrive as `checkout.*` with the id
 * at `data.checkout.id`; boletos arrive as `transparent.*`.
 *
 * @example
 * readPaymentNotice({ event: 'checkout.refunded', data: { checkout: { id: 'bill_1' } } });
 * // { kind: 'refunded', checkoutId: 'bill_1' }
 */
export function readPaymentNotice(payload: unknown): PaymentNotice {
    const data = field(payload, 'data');
    const event = isObject(payload) ? payload.event : null;
    if (event === 'checkout.completed') return paid(checkoutId(data), checkoutPayment(data));
    if (event === 'checkout.refunded') return refunded(checkoutId(data));
    if (event === 'transparent.completed') return paid(transparentId(data), BOLETO_PAYMENT);
    if (event === 'transparent.refunded') return refunded(transparentId(data));
    return IGNORED;
}

const BOLETO_PAYMENT: NoticedPayment = {
    paymentMethod: 'BOLETO',
    cardInstallments: null,
    platformFeeCents: null
};

function paid(checkoutId: string | null, payment: NoticedPayment): PaymentNotice {
    return checkoutId ? { kind: 'paid', checkoutId, payment } : IGNORED;
}

function refunded(checkoutId: string | null): PaymentNotice {
    return checkoutId ? { kind: 'refunded', checkoutId } : IGNORED;
}

function checkoutId(data: Json | null): string | null {
    return text(field(data, 'checkout')?.id);
}

// The path of a transparent payment's id is undocumented: Phoenix tried the
// nested `transparent` object first, then a top-level `id`, and so does this
// until a real `transparent.completed` payload settles it.
function transparentId(data: Json | null): string | null {
    return text(field(data, 'transparent')?.id) ?? text(data?.id);
}

// By example of Abacate's `checkout.completed`: `data.payerInformation.method`
// is "PIX" or "CARD", `data.checkout.installmentsCount` is set for cards and
// `data.checkout.platformFee` is the fee in cents. Any of them may be missing;
// what is missing stays null and the dashboard falls back to the Pix assumption.
function checkoutPayment(data: Json | null): NoticedPayment {
    const checkout = field(data, 'checkout');
    const method = text(field(data, 'payerInformation')?.method)?.toUpperCase();
    return {
        paymentMethod: method === 'PIX' || method === 'CARD' ? method : null,
        cardInstallments: wholeNumber(checkout?.installmentsCount, 1),
        platformFeeCents: wholeNumber(checkout?.platformFee, 0)
    };
}

function isObject(value: unknown): value is Json {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function field(parent: unknown, name: string): Json | null {
    const value = isObject(parent) ? parent[name] : null;
    return isObject(value) ? value : null;
}

function text(value: unknown): string | null {
    return typeof value === 'string' && value !== '' ? value : null;
}

function wholeNumber(value: unknown, minimum: number): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value >= minimum ? value : null;
}
