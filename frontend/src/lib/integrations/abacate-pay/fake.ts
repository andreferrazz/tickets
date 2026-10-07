import { randomBytes } from 'node:crypto';
import type {
    AbacatePayGateway,
    CreatedPayout,
    NewPayout,
    PaymentState,
    SettledPaymentMethod
} from './gateway';
import { AbacatePayError } from './errors';

/**
 * In-memory Abacate Pay for e2e runs and local development. Product and customer ids are
 * deterministic, a hosted checkout's url is its own `completionUrl` (the
 * browser "pays" by coming back, as the Phoenix test mock did), and every
 * payment stays pending until `settle` says otherwise.
 *
 * @example
 * const abacate = getFakeAbacatePay();
 * const { id } = await abacate.createCheckout(checkout);
 * abacate.settle(id, { status: 'paid', paymentMethod: 'PIX' });
 */
export interface FakeAbacatePay extends AbacatePayGateway {
    /** What later `getCheckout`/`getTransparent` calls report for `id`. */
    settle(id: string, state: Partial<PaymentState>): void;
    /** From now on, asking about `id` fails the way an Abacate outage does. */
    cutOff(id: string): void;
    /** Every payout requested, newest last. */
    readonly payouts: readonly (NewPayout & CreatedPayout)[];
}

const BOLETO_TTL_DAYS = 3;

export function getFakeAbacatePay(): FakeAbacatePay {
    const states = new Map<string, PaymentState>();
    const payouts: (NewPayout & CreatedPayout)[] = [];
    const unreachable = new Set<string>();
    const stateOf = (id: string, method: SettledPaymentMethod | null): PaymentState => {
        if (unreachable.has(id))
            throw new AbacatePayError('upstream', 503, `fake outage for ${id}`);
        return states.get(id) ?? pending(method);
    };
    // Unique per boot: orders outlive the process in a development database,
    // and a restarted counter would hand a new order an old order's checkout id.
    const boot = randomBytes(4).toString('hex');
    let sequence = 0;
    const nextId = (prefix: string) =>
        `${prefix}_fake_${boot}_${String(++sequence).padStart(6, '0')}`;

    return {
        payouts,
        async createProduct(product) {
            return `prod_fake_${product.externalId}`;
        },
        async createCustomer(customer) {
            return `cust_fake_${customer.taxId}`;
        },
        async createCheckout(checkout) {
            const id = nextId('bill');
            states.set(id, pending(null));
            return { id, url: checkout.completionUrl };
        },
        async createBoleto() {
            const id = nextId('bole');
            states.set(id, pending('BOLETO'));
            return {
                id,
                url: `https://fake.abacatepay.invalid/boleto/${id}`,
                expiresAt: daysFromNow(BOLETO_TTL_DAYS)
            };
        },
        async getCheckout(checkoutId) {
            return stateOf(checkoutId, null);
        },
        async getTransparent(transparentId) {
            return stateOf(transparentId, 'BOLETO');
        },
        async createPayout(payout) {
            const created: CreatedPayout = {
                id: `pyt_fake_${payout.externalId}`,
                status: 'pending',
                receiptUrl: null
            };
            payouts.push({ ...payout, ...created });
            return created;
        },
        settle(id, state) {
            states.set(id, { ...(states.get(id) ?? pending(null)), ...state });
        },
        cutOff(id) {
            unreachable.add(id);
        }
    };
}

function pending(paymentMethod: SettledPaymentMethod | null): PaymentState {
    return { status: 'pending', paymentMethod, cardInstallments: null };
}

function daysFromNow(days: number): string {
    return new Date(Date.now() + days * 86_400_000).toISOString();
}
