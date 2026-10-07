import { randomBytes } from 'node:crypto';
import type { Queryable } from '$lib/db/queryable';
import type { Mailer } from '$lib/integrations/mail/mailer';
import type { AuthService } from '$lib/modules/accounts/auth-service';
import { normalizeEmail } from '$lib/modules/accounts/auth-service';
import type { UserRepository } from '$lib/modules/accounts/repository';
import type { UserRow } from '$lib/modules/accounts/types';
import { LeaderExistsError } from '$lib/modules/organizations/errors';
import type { OrganizationRepository } from '$lib/modules/organizations/repository';
import type { OrganizationService } from '$lib/modules/organizations/service';
import type { SessionUser } from '$lib/modules/sessions/types';
import type { OrganizationRow } from '$lib/modules/organizations/types';
import type { OrgRole } from '$lib/types';
import { isEmailAddress } from '$lib/utils/email';
import { isUuid } from '$lib/utils/uuid';
import { INVITATION_TTL_HOURS, invitationEmail } from './invitation-email';
import type { InvitationRepository } from './repository';
import type { InvitationSecretRow } from './types';

export interface NewInvitation {
    email: string;
    /** Managers of several organizations must say which; admins never pass one. */
    organizationId: string | null;
    /** `participant` (default) or `staff`; admins always invite a `leader`. */
    role: string | null;
    /** Admins only: the new organization's name; blank means "<email local part>'s Org". */
    organizationName: string | null;
}

export type InviteFailure =
    | 'email_required'
    | 'invalid_email'
    | 'forbidden'
    | 'organization_id_required'
    | 'invalid_role'
    | 'already_invited'
    | 'already_member';

export type InviteResult = { ok: true } | { ok: false; failure: InviteFailure };

export interface AcceptedInvitation {
    sessionToken: string;
    user: UserRow;
    organization: { id: string; name: string; role: OrgRole };
}

export type AcceptFailure =
    'invalid_token' | 'expired' | 'already_accepted' | 'organization_has_leader';

/** What an invitation link shows before anyone accepts it. */
export interface PeekedInvitation {
    email: string;
    organizationName: string;
    role: OrgRole;
}

export type PeekResult =
    { ok: true; value: PeekedInvitation } | { ok: false; failure: AcceptFailure };

export type AcceptResult =
    { ok: true; value: AcceptedInvitation } | { ok: false; failure: AcceptFailure };

/**
 * Invitations as `Backend.Invitations` and `Accounts.accept_invitation/1`
 * ran them: an admin invites a new leader and the organization is born with
 * the invitation; a manager invites a participant or scan-only staff into
 * their own. Accepting consumes a 24-hour token, creates or promotes the
 * user, attaches the membership and signs them in.
 */
export interface InvitationWriteService {
    /** `origin` builds the accept link (`${origin}/invite/<token>`). */
    create(user: SessionUser, input: NewInvitation, origin: string): Promise<InviteResult>;
    /** Describes a live invitation without consuming it; safe to call on a GET. */
    peek(token: string): Promise<PeekResult>;
    accept(token: string): Promise<AcceptResult>;
}

export interface InvitationWriteServiceDeps {
    queryable: Queryable;
    invitations: InvitationRepository;
    organizations: OrganizationRepository;
    organizationService: OrganizationService;
    users: UserRepository;
    auth: AuthService;
    mailer: Mailer;
}

export function getInvitationWriteService(
    deps: InvitationWriteServiceDeps
): InvitationWriteService {
    return {
        async create(user, input, origin) {
            const email = normalizeEmail(input.email);
            if (!email) return { ok: false, failure: 'email_required' };
            if (!isEmailAddress(email)) return { ok: false, failure: 'invalid_email' };
            // Before the target is resolved: for an admin that step creates the
            // organization, which must not happen for an invitation we refuse.
            if (await deps.invitations.findPendingByEmail(email)) {
                return { ok: false, failure: 'already_invited' };
            }
            const inviter = await deps.users.findById(user.id);
            if (!inviter) return { ok: false, failure: 'forbidden' };
            const target = await resolveTarget(deps, user, input, email);
            if (typeof target === 'string') return { ok: false, failure: target };
            if (await deps.organizations.isEmailMember(email, target.organizationId)) {
                return { ok: false, failure: 'already_member' };
            }
            const token = randomBytes(32).toString('base64url');
            await deps.invitations.insert({
                inviterId: user.id,
                email,
                token,
                ttlHours: INVITATION_TTL_HOURS,
                ...target
            });
            await sendInvitation(deps.mailer, email, inviter.email, `${origin}/invite/${token}`);
            return { ok: true };
        },

        async peek(token) {
            const live = await findLive(deps, token);
            if (!live.ok) return live;
            const { invitation, organization } = live.value;
            return {
                ok: true,
                value: {
                    email: invitation.email,
                    organizationName: organization.name,
                    role: invitation.role
                }
            };
        },

        async accept(token) {
            const live = await findLive(deps, token);
            if (!live.ok) return live;
            const { invitation, organization } = live.value;
            const user = await consume(deps, invitation);
            if (!user) return { ok: false, failure: 'organization_has_leader' };
            const sessionToken = await deps.auth.createSession(user);
            return {
                ok: true,
                value: {
                    sessionToken,
                    user,
                    organization: {
                        id: organization.id,
                        name: organization.name,
                        role: invitation.role
                    }
                }
            };
        }
    };
}

type LiveInvitation =
    | { ok: true; value: { invitation: InvitationSecretRow; organization: OrganizationRow } }
    | { ok: false; failure: AcceptFailure };

async function findLive(deps: InvitationWriteServiceDeps, token: string): Promise<LiveInvitation> {
    const invitation = token ? await deps.invitations.findByToken(token) : null;
    if (!invitation) return { ok: false, failure: 'invalid_token' };
    if (invitation.status === 'accepted') return { ok: false, failure: 'already_accepted' };
    if (invitation.status === 'expired' || invitation.expires_at <= new Date()) {
        return { ok: false, failure: 'expired' };
    }
    const organization = await deps.organizations.findById(invitation.organization_id);
    if (!organization) return { ok: false, failure: 'invalid_token' };
    return { ok: true, value: { invitation, organization } };
}

// The invitation exists whether or not the mail went out, as it did in
// Phoenix: failing the request here would leave a row the inviter cannot see
// and a retry answered with "already invited".
async function sendInvitation(
    mailer: Mailer,
    to: string,
    inviter: string,
    link: string
): Promise<void> {
    try {
        await mailer.send(invitationEmail(to, inviter, link));
    } catch (cause) {
        console.error(JSON.stringify({ event: 'invitation_email_failed', error: String(cause) }));
    }
}

type Target = { organizationId: string; role: OrgRole };

// Admins invite a leader into a brand-new organization; managers invite into
// one of theirs, which must be named when they manage more than one.
async function resolveTarget(
    deps: InvitationWriteServiceDeps,
    user: SessionUser,
    input: NewInvitation,
    email: string
): Promise<Target | InviteFailure> {
    if (user.role === 'admin') {
        const name = input.organizationName?.trim() || defaultOrganizationName(email);
        const organization = await deps.organizations.insert(name);
        return { organizationId: organization.id, role: 'leader' };
    }
    const role = input.role ?? 'participant';
    if (role !== 'participant' && role !== 'staff') return 'invalid_role';
    if (input.organizationId) {
        if (!isUuid(input.organizationId)) return 'forbidden';
        const allowed = await deps.organizationService.canManage(user, input.organizationId);
        return allowed ? { organizationId: input.organizationId, role } : 'forbidden';
    }
    const managed = await deps.organizationService.listManagedOrganizationIds(user);
    if (managed.length === 0) return 'forbidden';
    if (managed.length > 1) return 'organization_id_required';
    return { organizationId: managed[0], role };
}

function defaultOrganizationName(email: string): string {
    const local = email.split('@', 1)[0]?.trim();
    return local ? `${local}'s Org` : 'Organization';
}

// Finds or creates the user, promotes a buyer unless the invitation is for
// scan-only staff, attaches the membership (re-acceptance by a member is not
// an error) and marks the invitation accepted, all in one transaction. Null
// when the organization already has a leader: everything rolls back.
async function consume(
    deps: InvitationWriteServiceDeps,
    invitation: InvitationSecretRow
): Promise<UserRow | null> {
    try {
        return await deps.queryable.transaction((tx) => consumeIn(deps, tx, invitation));
    } catch (cause) {
        if (cause instanceof LeaderExistsError) return null;
        throw cause;
    }
}

async function consumeIn(
    deps: InvitationWriteServiceDeps,
    tx: Queryable,
    invitation: InvitationSecretRow
): Promise<UserRow> {
    const existing = await deps.users.findByEmail(invitation.email, tx);
    const user = existing ?? (await deps.users.insertBuyer(invitation.email, tx));
    const promoted =
        user.role === 'buyer' && invitation.role !== 'staff'
            ? await deps.users.promoteToCreator(tx, user.id, invitation.inviter_id)
            : user;
    const outcome = await deps.organizations.addMember(
        tx,
        invitation.organization_id,
        user.id,
        invitation.role
    );
    if (outcome === 'leader_exists') throw new LeaderExistsError(invitation.organization_id);
    await deps.invitations.markAccepted(tx, invitation.id);
    return promoted;
}
