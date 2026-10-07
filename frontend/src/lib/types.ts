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
    status: 'draft' | 'published' | 'cancelled' | 'closed';
    created_at: string;
    updated_at: string;
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
}

export type OrderStatus = 'pending' | 'paid' | 'expired' | 'refunded' | 'cancelled';

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

export type PaymentMethod = 'PIX' | 'CARD' | 'BOLETO';

export interface EventOrderLine {
    name: string;
    quantity: number;
    unit_price_cents: number;
}

export interface EventOrder {
    id: string;
    buyer_name: string | null;
    buyer_email: string;
    buyer_phone: string | null;
    status: OrderStatus;
    total_cents: number;
    payment_method: PaymentMethod | null;
    paid_at: string | null;
    created_at: string;
    tickets: EventOrderLine[];
    extras: EventOrderLine[];
    /** Checked-in ticket passes; paired with the ticket total as validated/total. */
    validated_count: number;
}

export interface Organization {
    id: string;
    name: string;
    pix_key?: string | null;
    pix_key_type?: PixKeyType | null;
    created_at?: string;
    updated_at?: string;
}

export type OrgRole = 'leader' | 'participant' | 'staff';

export interface OrganizationMembership {
    id: string;
    name: string;
    role: OrgRole;
}

export interface CartLine {
    item_type: 'ticket' | 'extra';
    item_id: string;
    quantity: number;
}

export interface CompRecipient {
    email: string;
    quantity: number;
}

export interface CompTicketsResult {
    /** Recipient emails that received their free tickets. */
    sent: string[];
    /** Recipients that were skipped, each with a short reason string. */
    failed: { email: string | null; error: string }[];
}

export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'evp';

export interface PayoutSettings {
    pix_key: string | null;
    pix_key_type: PixKeyType | null;
}

export type PayoutStatus = 'pending' | 'complete' | 'failed' | 'cancelled' | 'refunded' | 'expired';

export interface Payout {
    id: string;
    amount_cents: number;
    status: PayoutStatus;
    pix_key: string;
    pix_key_type: PixKeyType;
    receipt_url: string | null;
    error_message: string | null;
    created_at: string;
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
