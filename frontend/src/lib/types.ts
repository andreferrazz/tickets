export type Role = 'buyer' | 'creator' | 'admin';

export interface User {
	id: string;
	email: string;
	role: Role;
	invited_by: string | null;
	name: string | null;
	cellphone: string | null;
	tax_id: string | null;
	abacate_customer_id: string | null;
	profile_complete: boolean;
	created_at: string;
}

export interface ProfileUpdate {
	name: string;
	cellphone: string;
	tax_id: string;
}

export interface Event {
	id: string;
	organization_id: string;
	created_by_id: string | null;
	title: string;
	description: string;
	tickets_description: string | null;
	location: string;
	starts_at: string;
	ends_at: string | null;
	cover_image_url: string | null;
	status: 'draft' | 'published' | 'cancelled';
	seat_selection_enabled: boolean;
	seats_per_table: number | null;
	created_at: string;
	updated_at: string;
}

export interface SeatTable {
	id: string;
	event_id: string;
	name: string;
	position: number;
}

export interface SeatingTableSnapshot {
	id: string;
	name: string;
	position: number;
	taken_seats: number[];
}

export interface Seating {
	seats_per_table: number;
	tables: SeatingTableSnapshot[];
}

export interface SeatPick {
	seat_table_id: string;
	seat_number: number;
}

export interface Batch {
	id: string;
	ticket_type_id: string;
	sequence: number;
	label: string;
	price_cents: number;
	quantity_total: number;
	quantity_sold: number;
	closed_at: string | null;
}

export interface TicketType {
	id: string;
	event_id: string;
	name: string;
	description: string;
	sales_start: string | null;
	sales_end: string | null;
	active_batch: Batch | null;
	batches: Batch[];
}

export interface ExtraItem {
	id: string;
	event_id: string;
	section_id: string;
	name: string;
	description: string;
	price_cents: number;
	quantity_total: number | null;
	quantity_sold: number;
	show_remaining: boolean;
	limit_to_ticket_count: boolean;
}

export interface ExtraSection {
	id: string;
	event_id: string;
	title: string;
	description: string | null;
	position: number;
	extras: ExtraItem[];
}

export interface EventDetail extends Event {
	ticket_types: TicketType[];
	extra_sections: ExtraSection[];
	seating: Seating | null;
}

export type OrderStatus = 'pending' | 'paid' | 'expired' | 'refunded';

export interface OrderItem {
	id: string;
	order_id: string;
	item_type: 'ticket' | 'extra';
	item_id: string;
	item_name: string;
	quantity: number;
	unit_price_cents: number;
}

export interface Pass {
	id: string;
	kind: 'ticket' | 'extra';
	item_name: string;
	seat_label: string | null;
	token: string;
	checked_in_at: string | null;
	qr_png_base64: string;
}

export interface Order {
	id: string;
	user_id: string;
	event_id: string;
	event_title: string;
	status: OrderStatus;
	total_cents: number;
	abacate_payment_url: string | null;
	paid_at: string | null;
	created_at: string;
	items: OrderItem[];
}

export interface Invitation {
	id: string;
	inviter_id: string;
	organization_id: string;
	role: OrgRole;
	email: string;
	status: 'pending' | 'accepted';
	created_at: string;
}

export interface Organization {
	id: string;
	name: string;
	created_at?: string;
	updated_at?: string;
}

export type OrgRole = 'leader' | 'participant';

export interface InvitedOrganization {
	id: string;
	name: string;
	role: OrgRole;
}

export interface OrganizationMembership {
	id: string;
	name: string;
	role: OrgRole;
}

export interface AuthResponse {
	token: string;
	user: User;
	/** Present only when this auth response came from accepting an invitation. */
	organization?: InvitedOrganization;
}

export interface CartLine {
	item_type: 'ticket' | 'extra';
	item_id: string;
	quantity: number;
}

export interface EventStatsTotals {
	orders_paid: number;
	orders_pending: number;
	revenue_cents: number;
	gross_revenue_cents: number;
	fees_cents: number;
	net_revenue_cents: number;
	tickets_sold: number;
	tickets_capacity: number;
	extras_sold: number;
	passes_issued: number;
	passes_checked_in: number;
}

export interface BatchStats {
	id: string;
	sequence: number;
	label: string;
	sold: number;
	capacity: number;
	price_cents: number;
	closed_at: string | null;
}

export interface TicketTypeStats {
	id: string;
	name: string;
	sold: number;
	capacity: number;
	revenue_cents: number;
	batches: BatchStats[];
}

export interface ExtraStats {
	id: string;
	name: string;
	section_title: string;
	sold: number;
	capacity: number | null;
	revenue_cents: number;
}

export interface RecentOrderRow {
	id: string;
	buyer_email: string;
	status: OrderStatus;
	total_cents: number;
	paid_at: string | null;
	created_at: string;
	item_count: number;
}

export interface EventStats {
	event_id: string;
	totals: EventStatsTotals;
	ticket_types: TicketTypeStats[];
	extras: ExtraStats[];
	recent_orders: RecentOrderRow[];
}

export interface ExtraBuyer {
	name: string | null;
	tax_id: string | null;
	email: string;
	quantity: number;
}
