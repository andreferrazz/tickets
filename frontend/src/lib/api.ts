import { PUBLIC_API_URL } from '$env/static/public';
import { auth } from '$lib/stores/auth.svelte';
import type {
    CartLine,
    CompRecipient,
    CompTicketsResult,
    EventDetail,
    EventOrder,
    Order,
    Organization,
    OrganizationMembership,
    PaymentMethod,
    Payout,
    PayoutSettings,
    ValidateResult
} from '$lib/types';

const BASE = PUBLIC_API_URL;
if (!BASE) {
    throw new Error('PUBLIC_API_URL is required (e.g. http://localhost:4000/api/v1)');
}

interface FetchOptions {
    method?: string;
    body?: unknown;
    fetcher?: typeof fetch;
}

export type FieldErrors = Record<string, string[]>;

export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
        public fieldErrors?: FieldErrors
    ) {
        super(message);
    }
}

async function request<T>(path: string, opts: FetchOptions = {}): Promise<T> {
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (auth.token) headers.authorization = `Bearer ${auth.token}`;
    const fetcher = opts.fetcher ?? fetch;
    const res = await fetcher(`${BASE}${path}`, {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    });
    if (!res.ok) {
        if (res.status === 401 && auth.token) await auth.clear(); // stale/expired/revoked session
        let msg = `${res.status}`;
        let fieldErrors: FieldErrors | undefined;
        try {
            const data = (await res.json()) as {
                error?: string | FieldErrors;
                errors?: { detail?: string };
            };
            if (typeof data.error === 'string') {
                msg = data.error;
            } else if (data.error && typeof data.error === 'object') {
                msg = 'validation_failed';
                fieldErrors = data.error;
            } else if (data.errors?.detail) {
                msg = data.errors.detail;
            }
        } catch {
            /* noop */
        }
        throw new ApiError(res.status, msg, fieldErrors);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
}

export const api = {
    myOrganizations: (fetcher?: typeof fetch) =>
        request<OrganizationMembership[]>('/me/organizations', { fetcher }),
    getEvent: (id: string, fetcher?: typeof fetch) =>
        request<EventDetail>(`/events/${id}`, { fetcher }),
    updatePayoutSettings: (orgId: string, body: PayoutSettings) =>
        request<Organization>(`/organizations/${orgId}/payout-settings`, {
            method: 'PATCH',
            body
        }),
    createPayout: (eventId: string, body: { amount_cents: number }) =>
        request<Payout>(`/events/${eventId}/payouts`, { method: 'POST', body }),
    listPayouts: (eventId: string) => request<Payout[]>(`/events/${eventId}/payouts`),
    createOrder: (event_id: string, items: CartLine[], payment_method?: PaymentMethod) =>
        request<Order>('/orders', {
            method: 'POST',
            body: { event_id, items, payment_method }
        }),
    cancelEventOrder: (eventId: string, orderId: string) =>
        request<EventOrder>(`/events/${eventId}/orders/${orderId}/cancel`, { method: 'POST' }),
    sendCompTickets: (eventId: string, itemId: string, recipients: CompRecipient[]) =>
        request<CompTicketsResult>(`/events/${eventId}/comp-orders`, {
            method: 'POST',
            body: { item_id: itemId, recipients }
        }),
    cancelOrder: (id: string) => request<Order>(`/orders/${id}/cancel`, { method: 'POST' }),
    validatePass: (eventId: string, token: string) =>
        request<ValidateResult>(`/events/${eventId}/passes/validate`, {
            method: 'POST',
            body: { token }
        })
};

export function formatBRL(cents: number): string {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
