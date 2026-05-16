import { PUBLIC_API_URL } from '$env/static/public';
import { auth } from '$lib/stores/auth.svelte';
import type {
	AuthResponse,
	Event,
	EventDetail,
	ExtraItem,
	Invitation,
	Order,
	ProfileUpdate,
	TicketType,
	User,
	CartLine
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
	updateProfile: (body: ProfileUpdate) =>
		request<User>('/me/profile', { method: 'PATCH', body }),
	listEvents: (fetcher?: typeof fetch) => request<Event[]>('/events', { fetcher }),
	getEvent: (id: string, fetcher?: typeof fetch) =>
		request<EventDetail>(`/events/${id}`, { fetcher }),
	createEvent: (body: Partial<Event>) => request<Event>('/events', { method: 'POST', body }),
	updateEvent: (id: string, body: Partial<Event>) =>
		request<Event>(`/events/${id}`, { method: 'PUT', body }),
	deleteEvent: (id: string) => request<{ deleted: true }>(`/events/${id}`, { method: 'DELETE' }),
	createTicketType: (eventId: string, body: Partial<TicketType>) =>
		request<TicketType>(`/events/${eventId}/ticket-types`, { method: 'POST', body }),
	updateTicketType: (id: string, body: Partial<TicketType>) =>
		request<TicketType>(`/ticket-types/${id}`, { method: 'PUT', body }),
	deleteTicketType: (id: string) =>
		request<{ deleted: true }>(`/ticket-types/${id}`, { method: 'DELETE' }),
	createExtra: (eventId: string, body: Partial<ExtraItem>) =>
		request<ExtraItem>(`/events/${eventId}/extras`, { method: 'POST', body }),
	updateExtra: (id: string, body: Partial<ExtraItem>) =>
		request<ExtraItem>(`/extras/${id}`, { method: 'PUT', body }),
	deleteExtra: (id: string) =>
		request<{ deleted: true }>(`/extras/${id}`, { method: 'DELETE' }),
	createOrder: (event_id: string, items: CartLine[]) =>
		request<Order>('/orders', { method: 'POST', body: { event_id, items } }),
	listOrders: (fetcher?: typeof fetch) => request<Order[]>('/orders', { fetcher }),
	getOrder: (id: string, fetcher?: typeof fetch) =>
		request<Order>(`/orders/${id}`, { fetcher }),
	listInvitations: (fetcher?: typeof fetch) =>
		request<Invitation[]>('/invitations', { fetcher }),
	createInvitation: (email: string) =>
		request<Invitation>('/invitations', { method: 'POST', body: { email } }),
	acceptInvitation: (token: string) =>
		request<AuthResponse>('/invitations/accept', { method: 'POST', body: { token } })
};

export function formatBRL(cents: number): string {
	return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDate(iso: string): string {
	return new Date(iso).toLocaleString('pt-BR', {
		dateStyle: 'medium',
		timeStyle: 'short'
	});
}
