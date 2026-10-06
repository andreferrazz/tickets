/**
 * What the app needs from Abacate Pay (https://docs.abacatepay.com), as the
 * Phoenix `AbacatePayBehaviour` defined it. Two implementations: `live.ts`
 * speaks HTTP, `fake.ts` keeps everything in memory for e2e runs.
 */
export type CheckoutStatus = 'paid' | 'pending' | 'cancelled' | 'expired' | 'refunded';
export type PayoutStatus = 'pending' | 'complete' | 'failed' | 'cancelled' | 'refunded' | 'expired';
/** Methods the hosted checkout page can offer. Boleto goes through `createBoleto`. */
export type HostedCheckoutMethod = 'PIX' | 'CARD';
export type SettledPaymentMethod = 'PIX' | 'CARD' | 'BOLETO';
export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'evp';

export interface NewProduct {
    name: string;
    priceCents: number;
    /** Our own id for the ticket type or extra; Abacate echoes it back. */
    externalId: string;
}

export interface NewCustomer {
    email: string;
    name: string;
    cellphone: string;
    taxId: string;
}

export interface CheckoutItem {
    /** An Abacate `prod_*` id from `createProduct`. */
    id: string;
    quantity: number;
}

export interface NewCheckout {
    items: CheckoutItem[];
    returnUrl: string;
    completionUrl: string;
    customerId: string | null;
    totalCents: number;
    methods: HostedCheckoutMethod[];
}

export interface CreatedCheckout {
    /** The `bill_*` id, stored on the order and matched against webhooks. */
    id: string;
    /** Where the buyer is sent to pay. */
    url: string;
}

export interface NewBoleto {
    totalCents: number;
    name: string;
    taxId: string;
}

export interface CreatedBoleto {
    /** The `bole_*` id, stored in the same order column as a checkout id. */
    id: string;
    url: string;
    /** ISO 8601, when Abacate reports one. */
    expiresAt: string | null;
}

export interface PaymentState {
    status: CheckoutStatus;
    paymentMethod: SettledPaymentMethod | null;
    cardInstallments: number | null;
}

export interface NewPayout {
    amountCents: number;
    /** Our own UUID; Abacate uses it as the idempotency key. */
    externalId: string;
    description: string | null;
    pixKey: string;
    pixKeyType: PixKeyType;
}

export interface CreatedPayout {
    id: string;
    status: PayoutStatus;
    receiptUrl: string | null;
}

export interface AbacatePayGateway {
    /** Returns the `prod_*` id. */
    createProduct(product: NewProduct): Promise<string>;
    /** Returns the `cust_*` id. Customers are unique per tax id; Abacate returns the existing one. */
    createCustomer(customer: NewCustomer): Promise<string>;
    createCheckout(checkout: NewCheckout): Promise<CreatedCheckout>;
    createBoleto(boleto: NewBoleto): Promise<CreatedBoleto>;
    getCheckout(checkoutId: string): Promise<PaymentState>;
    getTransparent(transparentId: string): Promise<PaymentState>;
    createPayout(payout: NewPayout): Promise<CreatedPayout>;
}
