import type {
    AbacatePayGateway,
    CreatedPayout,
    NewPayout,
    PaymentState,
    SettledPaymentMethod
} from './gateway';

/**
 * In-memory Abacate Pay for e2e runs and local development. Ids are
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
    /** Every payout requested, newest last. */
    readonly payouts: readonly (NewPayout & CreatedPayout)[];
}

const BOLETO_TTL_DAYS = 3;

export function getFakeAbacatePay(): FakeAbacatePay {
    const states = new Map<string, PaymentState>();
    const payouts: (NewPayout & CreatedPayout)[] = [];
    let sequence = 0;
    const nextId = (prefix: string) => `${prefix}_fake_${String(++sequence).padStart(6, '0')}`;

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
            return states.get(checkoutId) ?? pending(null);
        },
        async getTransparent(transparentId) {
            return states.get(transparentId) ?? pending('BOLETO');
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
        }
    };
}

function pending(paymentMethod: SettledPaymentMethod | null): PaymentState {
    return { status: 'pending', paymentMethod, cardInstallments: null };
}

function daysFromNow(days: number): string {
    return new Date(Date.now() + days * 86_400_000).toISOString();
}
