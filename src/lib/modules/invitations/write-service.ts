import { randomBytes } from 'node:crypto';
import type { Queryable } from '$lib/db/queryable';
import type { Mailer } from '$lib/integrations/mail/mailer';
import type { AuthService } from '$lib/modules/accounts/auth-service';
import { normalizeEmail } from '$lib/modules/accounts/auth-service';
import type { UserRepository } from '$lib/modules/accounts/repository';
import {
    canLeadTeam,
    higherRole,
    isInvitableRole,
    type InvitableRole
} from '$lib/modules/accounts/roles';
import type { UserRow } from '$lib/modules/accounts/types';
import type { SessionUser } from '$lib/modules/sessions/types';
import { isEmailAddress } from '$lib/utils/email';
import { INVITATION_TTL_HOURS, invitationEmail } from './invitation-email';
import type { InvitationRepository } from './repository';
import type { InvitationSecretRow } from './types';

export interface NewInvitation {
    email: string;
    /** `member` (default), `leader` or `staff`. */
    role: string | null;
}

export type InviteFailure =
    | 'email_required'
    | 'invalid_email'
    | 'forbidden'
    | 'invalid_role'
    | 'already_invited'
    | 'already_member';

export type InviteResult = { ok: true } | { ok: false; failure: InviteFailure };

export interface AcceptedInvitation {
    sessionToken: string;
    user: UserRow;
}

export type AcceptFailure = 'invalid_token' | 'expired' | 'already_accepted';

/** What an invitation link shows before anyone accepts it. */
export interface PeekedInvitation {
    email: string;
    role: InvitableRole;
}

export type PeekResult =
    { ok: true; value: PeekedInvitation } | { ok: false; failure: AcceptFailure };

export type AcceptResult =
    { ok: true; value: AcceptedInvitation } | { ok: false; failure: AcceptFailure };

/**
 * Invitations into the team, as `Backend.Invitations` and
 * `Accounts.accept_invitation/1` ran them: a leader or admin invites someone
 * as member, leader or staff. Accepting consumes a 24-hour token, creates the
 * user if needed, raises their role to the invited one and signs them in.
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
    users: UserRepository;
    auth: AuthService;
    mailer: Mailer;
    /** Named in the email, so the invitee knows whose team this is. */
    organizationName: string;
}

export function getInvitationWriteService(
    deps: InvitationWriteServiceDeps
): InvitationWriteService {
    return {
        async create(user, input, origin) {
            if (!canLeadTeam(user.role)) return { ok: false, failure: 'forbidden' };
            const email = normalizeEmail(input.email);
            if (!email) return { ok: false, failure: 'email_required' };
            if (!isEmailAddress(email)) return { ok: false, failure: 'invalid_email' };
            const role = input.role ?? 'member';
            if (!isInvitableRole(role)) return { ok: false, failure: 'invalid_role' };
            if (await deps.invitations.findPendingByEmail(email)) {
                return { ok: false, failure: 'already_invited' };
            }
            if (await holdsAlready(deps, email, role))
                return { ok: false, failure: 'already_member' };
            const inviter = await deps.users.findById(user.id);
            if (!inviter) return { ok: false, failure: 'forbidden' };
            const token = randomBytes(32).toString('base64url');
            await deps.invitations.insert({
                inviterId: user.id,
                email,
                role,
                token,
                ttlHours: INVITATION_TTL_HOURS
            });
            await sendInvitation(deps, email, inviter.email, `${origin}/invite/${token}`);
            return { ok: true };
        },

        async peek(token) {
            const live = await findLive(deps, token);
            if (!live.ok) return live;
            return { ok: true, value: { email: live.value.email, role: live.value.role } };
        },

        async accept(token) {
            const live = await findLive(deps, token);
            if (!live.ok) return live;
            const user = await deps.queryable.transaction((tx) => consume(deps, tx, live.value));
            const sessionToken = await deps.auth.createSession(user);
            return { ok: true, value: { sessionToken, user } };
        }
    };
}

type LiveInvitation =
    { ok: true; value: InvitationSecretRow } | { ok: false; failure: AcceptFailure };

async function findLive(deps: InvitationWriteServiceDeps, token: string): Promise<LiveInvitation> {
    const invitation = token ? await deps.invitations.findByToken(token) : null;
    if (!invitation) return { ok: false, failure: 'invalid_token' };
    if (invitation.status === 'accepted') return { ok: false, failure: 'already_accepted' };
    if (invitation.status === 'expired' || invitation.expires_at <= new Date()) {
        return { ok: false, failure: 'expired' };
    }
    return { ok: true, value: invitation };
}

// An invitation that would change nothing is refused up front, so the inviter
// learns the person is already on the team at that level or above.
async function holdsAlready(
    deps: InvitationWriteServiceDeps,
    email: string,
    role: InvitableRole
): Promise<boolean> {
    const existing = await deps.users.findByEmail(email);
    return existing !== null && higherRole(existing.role, role) === existing.role;
}

// The invitation exists whether or not the mail went out, as it did in
// Phoenix: failing the request here would leave a row the inviter cannot see
// and a retry answered with "already invited".
async function sendInvitation(
    deps: InvitationWriteServiceDeps,
    to: string,
    inviter: string,
    link: string
): Promise<void> {
    try {
        await deps.mailer.send(invitationEmail(to, inviter, link, deps.organizationName));
    } catch (cause) {
        console.error(JSON.stringify({ event: 'invitation_email_failed', error: String(cause) }));
    }
}

// Finds or creates the user, raises their role to the invited one (never
// lowers it: a leader re-invited as staff stays a leader) and marks the
// invitation accepted, all in one transaction.
async function consume(
    deps: InvitationWriteServiceDeps,
    tx: Queryable,
    invitation: InvitationSecretRow
): Promise<UserRow> {
    const existing = await deps.users.findByEmail(invitation.email, tx);
    const user = existing ?? (await deps.users.insertBuyer(invitation.email, tx));
    const role = higherRole(user.role, invitation.role);
    const updated =
        role === user.role
            ? user
            : await deps.users.setRole(tx, user.id, role, invitation.inviter_id);
    await deps.invitations.markAccepted(tx, invitation.id);
    return updated;
}
