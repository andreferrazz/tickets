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
	creator_id: string;
	title: string;
	description: string;
	location: string;
	starts_at: string;
	ends_at: string | null;
	cover_image_url: string | null;
	status: 'draft' | 'published' | 'cancelled';
	created_at: string;
	updated_at: string;
}

export interface TicketType {
	id: string;
	event_id: string;
	name: string;
	description: string;
	price_cents: number;
	quantity_total: number;
	quantity_sold: number;
	sales_start: string | null;
	sales_end: string | null;
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
	email: string;
	status: 'pending' | 'accepted';
	created_at: string;
}

export interface AuthResponse {
	token: string;
	user: User;
}

export interface CartLine {
	item_type: 'ticket' | 'extra';
	item_id: string;
	quantity: number;
}
