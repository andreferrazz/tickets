import type { AbacatePayConfig } from '$lib/config/abacate-pay';
import { AbacatePayError } from './errors';
import { maxCardInstallments } from './fees';
import type {
    AbacatePayGateway,
    NewCheckout,
    NewPayout,
    PaymentState,
    PixKeyType
} from './gateway';
import { normalizeCheckoutStatus, normalizePayoutStatus } from './status';

type Fetcher = typeof fetch;

/** The fields we read from Abacate's `data` object across all endpoints. */
interface ApiData {
    id?: string;
    url?: string;
    status?: string;
    installmentsCount?: number;
    expiresAt?: string | null;
    receiptUrl?: string | null;
}

interface ApiEnvelope {
    data?: ApiData;
    error?: string;
}

interface ApiResponse {
    status: number;
    body: ApiEnvelope;
}

/**
 * HTTP client for the Abacate Pay API v2, the live side of `AbacatePayGateway`.
 * Every failure surfaces as an `AbacatePayError`.
 *
 * @example
 * const abacate = getLiveAbacatePay(readAbacatePayConfig());
 * const { id, url } = await abacate.createCheckout({ items, returnUrl, completionUrl, customerId, totalCents, methods: ['PIX'] });
 */
export function getLiveAbacatePay(
    config: AbacatePayConfig,
    fetcher: Fetcher = fetch
): AbacatePayGateway {
    const api = apiClient(config, fetcher);
    return {
        async createProduct(product) {
            const body = {
                name: product.name,
                price: product.priceCents,
                currency: 'BRL',
                externalId: product.externalId
            };
            return requireField(await api.post('/products/create', body), 'id', 'product');
        },
        async createCustomer(customer) {
            const body = {
                email: customer.email,
                name: customer.name,
                cellphone: customer.cellphone,
                taxId: customer.taxId
            };
            return requireField(await api.post('/customers/create', body), 'id', 'customer');
        },
        async createCheckout(checkout) {
            const data = await api.post('/checkouts/create', checkoutBody(checkout));
            return {
                id: requireField(data, 'id', 'checkout'),
                url: requireField(data, 'url', 'checkout')
            };
        },
        async createBoleto(boleto) {
            const body = {
                method: 'BOLETO',
                data: {
                    amount: boleto.totalCents,
                    customer: { name: boleto.name, taxId: boleto.taxId }
                }
            };
            const data = await api.post('/transparents/create', body);
            return {
                id: requireField(data, 'id', 'boleto'),
                url: requireField(data, 'url', 'boleto'),
                expiresAt: data.expiresAt ?? null
            };
        },
        async getCheckout(checkoutId) {
            const data = await api.get('/checkouts/get', { id: checkoutId });
            return { status: normalizeCheckoutStatus(data.status), ...cardDetails(data) };
        },
        async getTransparent(transparentId) {
            const data = await api.get('/transparents/get', { id: transparentId });
            // Only boletos are created through the transparent endpoint.
            return {
                status: normalizeCheckoutStatus(data.status),
                paymentMethod: 'BOLETO',
                cardInstallments: null
            };
        },
        async createPayout(payout) {
            const data = await api.post('/payouts/create', payoutBody(payout));
            return {
                id: requireField(data, 'id', 'payout'),
                status: normalizePayoutStatus(data.status),
                receiptUrl: data.receiptUrl ?? null
            };
        }
    };
}

function apiClient(config: AbacatePayConfig, fetcher: Fetcher) {
    const headers = {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json'
    };
    return {
        async post(path: string, body: unknown): Promise<ApiData> {
            const init = { method: 'POST', headers, body: JSON.stringify(body) };
            return unwrap(await send(fetcher, `${config.baseUrl}${path}`, init), path);
        },
        async get(path: string, params: Record<string, string>): Promise<ApiData> {
            const url = `${config.baseUrl}${path}?${new URLSearchParams(params)}`;
            return unwrap(await send(fetcher, url, { method: 'GET', headers }), path);
        }
    };
}

async function send(fetcher: Fetcher, url: string, init: RequestInit): Promise<ApiResponse> {
    let response: Response;
    try {
        response = await fetcher(url, init);
    } catch (cause) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        throw new AbacatePayError('transport', null, `abacate_pay ${url} unreachable: ${reason}`, {
            cause
        });
    }
    const body = (await response.json().catch(() => ({}))) as ApiEnvelope;
    return { status: response.status, body };
}

// The same error classes the Phoenix client distinguished: 429 is a payout
// throttle, a 4xx carrying `error` is our bad input, anything else non-2xx is
// Abacate's problem.
function unwrap({ status, body }: ApiResponse, path: string): ApiData {
    if (status >= 200 && status < 300 && body.data) return body.data;
    const detail = body.error ?? JSON.stringify(body);
    if (status === 429) {
        throw new AbacatePayError(
            'rate_limited',
            status,
            `abacate_pay ${path} throttled: ${detail}`
        );
    }
    if (status >= 400 && status < 500 && body.error) {
        throw new AbacatePayError(
            'invalid_data',
            status,
            `abacate_pay ${path} rejected: ${detail}`
        );
    }
    throw new AbacatePayError(
        'upstream',
        status,
        `abacate_pay ${path} returned ${status}: ${detail}`
    );
}

function requireField(data: ApiData, field: 'id' | 'url', what: string): string {
    const value = data[field];
    if (!value) {
        throw new AbacatePayError(
            'upstream',
            null,
            `abacate_pay ${what} response has no ${field}: ${JSON.stringify(data)}`
        );
    }
    return value;
}

// Only configure installments when CARD is offered: Abacate rejects a checkout
// that carries a `card` config without CARD among its methods.
function checkoutBody(checkout: NewCheckout) {
    return {
        items: checkout.items,
        methods: checkout.methods,
        returnUrl: checkout.returnUrl,
        completionUrl: checkout.completionUrl,
        ...(checkout.customerId ? { customerId: checkout.customerId } : {}),
        ...(checkout.methods.includes('CARD')
            ? { card: { maxInstallments: maxCardInstallments(checkout.totalCents) } }
            : {})
    };
}

const PIX_KEY_TYPES: Record<PixKeyType, string> = {
    cpf: 'CPF',
    cnpj: 'CNPJ',
    email: 'EMAIL',
    phone: 'PHONE',
    evp: 'RANDOM'
};

function payoutBody(payout: NewPayout) {
    if (!Number.isInteger(payout.amountCents) || payout.amountCents <= 0) {
        throw new AbacatePayError(
            'invalid_data',
            null,
            `payout amount must be a positive integer in cents, got: ${payout.amountCents}`
        );
    }
    return {
        amount: payout.amountCents,
        externalId: payout.externalId,
        pix: { key: payout.pixKey, type: PIX_KEY_TYPES[payout.pixKeyType] },
        ...(payout.description ? { description: payout.description } : {})
    };
}

// Abacate's checkout payload only populates installmentsCount for card
// payments. Infer CARD from it and leave null otherwise, so callers do not
// overwrite a webhook-populated value with a guess.
function cardDetails(data: ApiData): Pick<PaymentState, 'paymentMethod' | 'cardInstallments'> {
    const count = data.installmentsCount;
    if (typeof count === 'number' && count > 0) {
        return { paymentMethod: 'CARD', cardInstallments: count };
    }
    return { paymentMethod: null, cardInstallments: null };
}
