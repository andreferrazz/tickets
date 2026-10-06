import type { Role } from '$lib/types';

/** A row of `users`, as Postgres returns it. */
export interface UserRow {
    id: string;
    email: string;
    role: Role;
    invited_by: string | null;
    name: string | null;
    cellphone: string | null;
    tax_id: string | null;
    abacate_customer_id: string | null;
    inserted_at: Date;
}

/** The wire shape of Phoenix's `user_json/1`, in camelCase. */
export interface UserDto {
    id: string;
    email: string;
    role: Role;
    invitedBy: string | null;
    name: string | null;
    cellphone: string | null;
    taxId: string | null;
    abacateCustomerId: string | null;
    /** True once Abacate Pay holds a customer for them (`User.profile_complete?/1`). */
    profileComplete: boolean;
    createdAt: string;
}
