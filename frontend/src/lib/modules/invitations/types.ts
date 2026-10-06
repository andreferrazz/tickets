import type { OrgRole } from '$lib/types';

export type InvitationStatus = 'pending' | 'accepted' | 'expired';

/** A row of `invitations`, as Postgres returns it (the token stays out). */
export interface InvitationRow {
    id: string;
    inviter_id: string;
    organization_id: string;
    role: OrgRole;
    email: string;
    status: InvitationStatus;
    inserted_at: Date;
}

/** The wire shape of Phoenix's `invitation_json/1`, in camelCase. */
export interface InvitationDto {
    id: string;
    inviterId: string;
    organizationId: string;
    role: OrgRole;
    email: string;
    status: InvitationStatus;
    createdAt: string;
}
