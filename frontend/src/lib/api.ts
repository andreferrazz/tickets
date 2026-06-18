import { PUBLIC_API_URL } from '$env/static/public';
import { auth } from '$lib/stores/auth.svelte';
import type {
	AuthResponse,
	Batch,
	Event,
	EventDetail,
	EventOrder,
	EventStats,
	ExtraBuyer,
	ExtraItem,
	ExtraSection,
	Invitation,
	Order,
	OrderStatus,
	PaymentMethod,
	Organization,
	OrganizationMembership,
	Pass,
	Payout,
	PayoutSettings,
	ProfileUpdate,
	SeatPick,
	SeatTable,
	Seating,
	TicketType,
	User,
	CartLine,
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
	requestCode: (email: string) =>
		request<{ sent: boolean }>('/auth/request-code', {
			method: 'POST',
			body: { email }
		}),
	verifyCode: (email: string, code: string) =>
		request<AuthResponse>('/auth/verify-code', { method: 'POST', body: { email, code } }),
	logout: () => request<{ logged_out: boolean }>('/auth/logout', { method: 'DELETE' }),
	me: (fetcher?: typeof fetch) => request<User>('/me', { fetcher }),
	myOrganizations: (fetcher?: typeof fetch) =>
		request<OrganizationMembership[]>('/me/organizations', { fetcher }),
	updateProfile: (body: ProfileUpdate) =>
		request<User>('/me/profile', { method: 'PATCH', body }),
	listEvents: (fetcher?: typeof fetch) => request<Event[]>('/events', { fetcher }),
	getEvent: (id: string, fetcher?: typeof fetch) =>
		request<EventDetail>(`/events/${id}`, { fetcher }),
	getEventStats: (id: string, fetcher?: typeof fetch) =>
		request<EventStats>(`/events/${id}/stats`, { fetcher }),
	createEvent: (body: Partial<Event>) => request<Event>('/events', { method: 'POST', body }),
	updateEvent: (id: string, body: Partial<Event>) =>
		request<Event>(`/events/${id}`, { method: 'PUT', body }),
	deleteEvent: (id: string) => request<{ deleted: true }>(`/events/${id}`, { method: 'DELETE' }),
	createTicketType: (eventId: string, body: Pick<TicketType, 'name'> & Partial<TicketType>) =>
		request<TicketType>(`/events/${eventId}/ticket-types`, { method: 'POST', body }),
	updateTicketType: (id: string, body: Partial<TicketType>) =>
		request<TicketType>(`/ticket-types/${id}`, { method: 'PUT', body }),
	deleteTicketType: (id: string) =>
		request<{ deleted: true }>(`/ticket-types/${id}`, { method: 'DELETE' }),
	createBatch: (ticketTypeId: string, body: Pick<Batch, 'price_cents' | 'quantity_total'>) =>
		request<Batch>(`/ticket-types/${ticketTypeId}/batches`, { method: 'POST', body }),
	updateBatch: (id: string, body: Partial<Pick<Batch, 'price_cents' | 'quantity_total'>>) =>
		request<Batch>(`/batches/${id}`, { method: 'PUT', body }),
	closeBatch: (id: string) => request<Batch>(`/batches/${id}/close`, { method: 'POST', body: {} }),
	deleteBatch: (id: string) => request<{ deleted: true }>(`/batches/${id}`, { method: 'DELETE' }),
	createExtra: (eventId: string, body: Partial<ExtraItem> & { section_id: string }) =>
		request<ExtraItem>(`/events/${eventId}/extras`, { method: 'POST', body }),
	updateExtra: (id: string, body: Partial<ExtraItem>) =>
		request<ExtraItem>(`/extras/${id}`, { method: 'PUT', body }),
	deleteExtra: (id: string) =>
		request<{ deleted: true }>(`/extras/${id}`, { method: 'DELETE' }),
	listExtraBuyers: (id: string, fetcher?: typeof fetch) =>
		request<ExtraBuyer[]>(`/extras/${id}/buyers`, { fetcher }),
	listTicketTypeBuyers: (id: string, fetcher?: typeof fetch) =>
		request<ExtraBuyer[]>(`/ticket-types/${id}/buyers`, { fetcher }),
	updatePayoutSettings: (orgId: string, body: PayoutSettings) =>
		request<Organization>(`/organizations/${orgId}/payout-settings`, {
			method: 'PATCH',
			body,
		}),
	createPayout: (eventId: string, body: { amount_cents: number }) =>
		request<Payout>(`/events/${eventId}/payouts`, { method: 'POST', body }),
	listPayouts: (eventId: string) =>
		request<Payout[]>(`/events/${eventId}/payouts`),
	createExtraSection: (eventId: string, body: Partial<ExtraSection>) =>
		request<ExtraSection>(`/events/${eventId}/extra-sections`, { method: 'POST', body }),
	updateExtraSection: (id: string, body: Partial<ExtraSection>) =>
		request<ExtraSection>(`/extra-sections/${id}`, { method: 'PUT', body }),
	deleteExtraSection: (id: string) =>
		request<{ deleted: true }>(`/extra-sections/${id}`, { method: 'DELETE' }),
	createSeatTable: (eventId: string, body: { name: string; position?: number }) =>
		request<SeatTable>(`/events/${eventId}/seat-tables`, { method: 'POST', body }),
	updateSeatTable: (id: string, body: Partial<Pick<SeatTable, 'name' | 'position'>>) =>
		request<SeatTable>(`/seat-tables/${id}`, { method: 'PUT', body }),
	deleteSeatTable: (id: string) =>
		request<{ deleted: true }>(`/seat-tables/${id}`, { method: 'DELETE' }),
	getEventSeating: (id: string, fetcher?: typeof fetch) =>
		request<Seating>(`/events/${id}/seating`, { fetcher }),
	createOrder: (
		event_id: string,
		items: CartLine[],
		seat_picks: SeatPick[] = [],
		payment_method?: PaymentMethod
	) =>
		request<Order>('/orders', {
			method: 'POST',
			body: { event_id, items, seat_picks, payment_method }
		}),
	listOrders: (fetcher?: typeof fetch) => request<Order[]>('/orders', { fetcher }),
	listEventOrders: (eventId: string, statuses: OrderStatus[] = [], fetcher?: typeof fetch) => {
		const qs = statuses.map((s) => `status[]=${encodeURIComponent(s)}`).join('&');
		const path = qs ? `/events/${eventId}/orders?${qs}` : `/events/${eventId}/orders`;
		return request<EventOrder[]>(path, { fetcher });
	},
	getOrder: (id: string, fetcher?: typeof fetch) =>
		request<Order>(`/orders/${id}`, { fetcher }),
	getOrderPasses: (id: string, fetcher?: typeof fetch) =>
		request<Pass[]>(`/orders/${id}/passes`, { fetcher }),
	validatePass: (eventId: string, token: string) =>
		request<ValidateResult>(`/events/${eventId}/passes/validate`, {
			method: 'POST',
			body: { token }
		}),
	listInvitations: (fetcher?: typeof fetch) =>
		request<Invitation[]>('/invitations', { fetcher }),
	createInvitation: (email: string, organization_id?: string) =>
		request<Invitation>('/invitations', {
			method: 'POST',
			body: organization_id ? { email, organization_id } : { email }
		}),
	acceptInvitation: (token: string) =>
		request<AuthResponse>('/invitations/accept', { method: 'POST', body: { token } }),
	updateOrganization: (id: string, body: { name: string }) =>
		request<Organization>(`/organizations/${id}`, { method: 'PATCH', body }),
	deleteOrganization: (id: string) =>
		request<{ deleted: true }>(`/organizations/${id}`, { method: 'DELETE' })
};

export function formatBRL(cents: number): string {
	return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
