import type { OrgRole, PixKeyType } from '$lib/types';

/** A row of `organizations`, as Postgres returns it. */
export interface OrganizationRow {
    id: string;
    name: string;
    pix_key: string | null;
    pix_key_type: PixKeyType | null;
    inserted_at: Date;
    updated_at: Date;
}

/** One member of an organization, joined to the user's email. */
export interface MemberRow {
    user_id: string;
    email: string;
    role: OrgRole;
}

/** The roles that may manage an organization; `staff` only scans. */
export type ManagerRole = 'leader' | 'participant';

/** The wire shape of Phoenix's `organization_json/1`, in camelCase. */
export interface OrganizationDto {
    id: string;
    name: string;
    pixKey: string | null;
    pixKeyType: PixKeyType | null;
    createdAt: string;
    updatedAt: string;
}

/** One of the caller's memberships with the organization's name, for the profile page. */
export interface MembershipSummaryRow {
    id: string;
    name: string;
    role: OrgRole;
}

export type AddMemberOutcome = 'added' | 'already_member' | 'leader_exists';

/** Why a role change or removal did not happen: no such member, or the member is the leader. */
export type MemberChangeOutcome = 'changed' | 'not_found' | 'leader';

export interface OrgMemberDto {
    userId: string;
    email: string;
    role: OrgRole;
}
