import type {
	Event,
	ExtraItem,
	Invitation,
	Order,
	TicketType,
	User
} from '$lib/types';

interface MockState {
	users: Map<string, User>;
	sessions: Map<string, string>;
	events: Map<string, Event>;
	ticketTypes: Map<string, TicketType>;
	extras: Map<string, ExtraItem>;
	orders: Map<string, Order>;
	invitations: Map<string, Invitation>;
	authCodes: Map<string, { code: string; expires_at: number }>;
}

const globalKey = Symbol.for('tickets.mockState');
type GlobalWithMock = typeof globalThis & { [globalKey]?: MockState };
const g = globalThis as GlobalWithMock;

function createState(): MockState {
	return {
		users: new Map(),
		sessions: new Map(),
		events: new Map(),
		ticketTypes: new Map(),
		extras: new Map(),
		orders: new Map(),
		invitations: new Map(),
		authCodes: new Map()
	};
}

export function getState(): MockState {
	if (!g[globalKey]) {
		g[globalKey] = createState();
		seedState(g[globalKey]!);
	}
	return g[globalKey]!;
}

export function uid(): string {
	return crypto.randomUUID();
}

export function nowIso(): string {
	return new Date().toISOString();
}

function seedState(s: MockState): void {
	const creator: User = {
		id: uid(),
		email: 'creator@tickets.dev',
		role: 'creator',
		invited_by: null,
		created_at: nowIso()
	};
	s.users.set(creator.id, creator);

	const events: Array<{ title: string; desc: string; loc: string; daysAhead: number; cover: string }> = [
		// {
		// 	title: 'Sunset Rooftop Party',
		// 	desc: 'An unforgettable evening with live DJs, craft cocktails, and panoramic city views.',
		// 	loc: 'Skyline Lounge, São Paulo',
		// 	daysAhead: 14,
		// 	cover: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800'
		// },
		// {
		// 	title: 'Indie Music Festival 2026',
		// 	desc: 'Three stages, twenty bands, one unforgettable night.',
		// 	loc: 'Parque Ibirapuera, São Paulo',
		// 	daysAhead: 30,
		// 	cover: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800'
		// },
		// {
		// 	title: 'Tech & Startup Conference',
		// 	desc: 'Keynotes from industry leaders, hands-on workshops, and networking lunch.',
		// 	loc: 'WTC, São Paulo',
		// 	daysAhead: 45,
		// 	cover: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800'
		// },
		// {
		// 	title: 'Stand-up Comedy Night',
		// 	desc: 'Five comedians, two hours, endless laughs.',
		// 	loc: 'Teatro Bradesco',
		// 	daysAhead: 7,
		// 	cover: 'https://images.unsplash.com/photo-1527224538127-2104bb71c51b?w=800'
		// }
		{
			title: 'Jantar Dançante',
			desc: 'Jantar Dançante do Grupo Sheila.',
			loc: 'Centro, Belo Horizonte',
			daysAhead: 14,
			cover: 'https://images.unsplash.com/photo-1527224538127-2104bb71c51b?w=800'
		},
	];

	for (const e of events) {
		const id = uid();
		const startsAt = new Date(Date.now() + e.daysAhead * 86400000).toISOString();
		const ev: Event = {
			id,
			creator_id: creator.id,
			title: e.title,
			description: e.desc,
			location: e.loc,
			starts_at: startsAt,
			ends_at: null,
			cover_image_url: e.cover,
			status: 'published',
			created_at: nowIso(),
			updated_at: nowIso()
		};
		s.events.set(id, ev);

		const general: TicketType = {
			id: uid(),
			event_id: id,
			name: 'Lote 1',
			description: 'Ingresso para o evento',
			price_cents: 12000,
			quantity_total: 100,
			quantity_sold: 71,
			sales_start: null,
			sales_end: null
		};
		const vip: TicketType = {
			id: uid(),
			event_id: id,
			name: 'Lote 2',
			description: 'Ingresso para o evento',
			price_cents: 14000,
			quantity_total: 100,
			quantity_sold: 0,
			sales_start: null,
			sales_end: null
		};
		s.ticketTypes.set(general.id, general);
		s.ticketTypes.set(vip.id, vip);

		const drink: ExtraItem = {
			id: uid(),
			event_id: id,
			name: 'Combo de bebidas',
			description: 'Refrigerantes e Sucos.',
			price_cents: 5000,
			quantity_total: null,
			quantity_sold: 0
		};
		const tshirt: ExtraItem = {
			id: uid(),
			event_id: id,
			name: 'Event T-shirt',
			description: 'Limited edition.',
			price_cents: 4000,
			quantity_total: 100,
			quantity_sold: 12
		};
		s.extras.set(drink.id, drink);
		// s.extras.set(tshirt.id, tshirt);
	}
}
