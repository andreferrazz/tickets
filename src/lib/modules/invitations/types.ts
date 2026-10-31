import type { InvitableRole } from '$lib/modules/accounts/roles';

export type InvitationStatus = 'pending' | 'accepted' | 'expired';

/** A row of `invitations`, as Postgres returns it (the token stays out). */
export interface InvitationRow {
    id: string;
    inviter_id: string;
    role: InvitableRole;
    email: string;
    status: InvitationStatus;
    inserted_at: Date;
}

/** The row with the parts only the accept link and the email see. */
export interface InvitationSecretRow extends InvitationRow {
    token: string;
    expires_at: Date;
}

export interface NewInvitationRow {
    inviterId: string;
    role: InvitableRole;
    email: string;
    token: string;
    ttlHours: number;
}

/** The wire shape of Phoenix's `invitation_json/1`, in camelCase. */
export interface InvitationDto {
    id: string;
    inviterId: string;
    role: InvitableRole;
    email: string;
    status: InvitationStatus;
    createdAt: string;
}
