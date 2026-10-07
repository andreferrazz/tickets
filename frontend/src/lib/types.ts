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

export type OrderStatus = 'pending' | 'paid' | 'expired' | 'refunded' | 'cancelled';

export interface Pass {
    id: string;
    kind: 'ticket' | 'extra';
    item_name: string;
    token: string;
    checked_in_at: string | null;
    qr_png_base64: string;
}

export type PaymentMethod = 'PIX' | 'CARD' | 'BOLETO';

export type OrgRole = 'leader' | 'participant' | 'staff';

export interface OrganizationMembership {
    id: string;
    name: string;
    role: OrgRole;
}

export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'evp';

export type PayoutStatus = 'pending' | 'complete' | 'failed' | 'cancelled' | 'refunded' | 'expired';

export interface RecentOrderRow {
    id: string;
    buyer_email: string;
    status: OrderStatus;
    total_cents: number;
    paid_at: string | null;
    created_at: string;
    item_count: number;
}
