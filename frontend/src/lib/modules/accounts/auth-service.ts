import { randomBytes, randomInt } from 'node:crypto';
import type { Queryable } from '$lib/db/queryable';
import type { Mailer } from '$lib/integrations/mail/mailer';
import type { InvitationRepository } from '$lib/modules/invitations/repository';
import type { InvitationRow } from '$lib/modules/invitations/types';
import type { OrganizationRepository } from '$lib/modules/organizations/repository';
import type { SessionRepository } from '$lib/modules/sessions/repository';
import { authCodeEmail, CODE_TTL_MINUTES } from './auth-code-email';
import type { AuthCodeRepository } from './auth-code-repository';
import type { UserRepository } from './repository';
import type { UserRow } from './types';

export const SESSION_TTL_DAYS = 30;

export interface SignedIn {
    token: string;
    user: UserRow;
}

/**
 * Passwordless login as `Backend.Accounts` ran it: a 6-digit code by email,
 * then a 30-day session. Verifying a code finds or creates the buyer and, when
 * a pending invitation names their email, promotes them and attaches the
 * membership in the same transaction.
 */
export interface AuthService {
    requestCode(email: string): Promise<void>;
    /** Null when the code is unknown, used or expired. */
    verifyCode(email: string, code: string): Promise<SignedIn | null>;
    logout(token: string): Promise<void>;
    /** Mints a session for `user` without a code: admin impersonation and invitation links. */
    createSession(user: UserRow): Promise<string>;
    findUserByToken(token: string): Promise<UserRow | null>;
}

export interface AuthServiceDeps {
    queryable: Queryable;
    users: UserRepository;
    authCodes: AuthCodeRepository;
    sessions: SessionRepository;
    invitations: InvitationRepository;
    organizations: OrganizationRepository;
    mailer: Mailer;
}

export function getAuthService(deps: AuthServiceDeps): AuthService {
    return {
        async requestCode(rawEmail) {
            const email = normalizeEmail(rawEmail);
            const code = String(randomInt(100_000, 1_000_000));
            await deps.authCodes.replacePending(email, code, CODE_TTL_MINUTES);
            await deps.mailer.send(authCodeEmail(email, code));
        },

        async verifyCode(rawEmail, code) {
            const email = normalizeEmail(rawEmail);
            const codeId = await deps.authCodes.findValid(email, code);
            if (!codeId) return null;
            const existing = await deps.users.findByEmail(email);
            const user = await promoteIfInvited(
                deps,
                existing ?? (await deps.users.insertBuyer(email))
            );
            const token = await this.createSession(user);
            await deps.authCodes.markUsed(codeId);
            return { token, user };
        },

        logout: (token) => deps.sessions.deleteByToken(token),

        async createSession(user) {
            const token = randomBytes(32).toString('base64url');
            await deps.sessions.insert(user.id, token, SESSION_TTL_DAYS);
            return token;
        },

        async findUserByToken(token) {
            const session = await deps.sessions.findUserByToken(token);
            return session ? deps.users.findById(session.id) : null;
        }
    };
}

export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

// A pending invitation for the email is consumed on login: buyers become
// creators (staff invitations only grant the scan membership), the membership
// is attached and the invitation marked accepted, all or nothing.
async function promoteIfInvited(deps: AuthServiceDeps, user: UserRow): Promise<UserRow> {
    if (user.role !== 'buyer') return user;
    const invitation = await deps.invitations.findPendingByEmail(user.email);
    if (!invitation) return user;
    return deps.queryable.transaction(async (tx) => {
        const promoted = await applyInvitationRole(deps, tx, user, invitation);
        await deps.organizations.addMember(
            tx,
            invitation.organization_id,
            user.id,
            invitation.role
        );
        await deps.invitations.markAccepted(tx, invitation.id);
        return promoted;
    });
}

async function applyInvitationRole(
    deps: AuthServiceDeps,
    tx: Queryable,
    user: UserRow,
    invitation: InvitationRow
): Promise<UserRow> {
    if (invitation.role === 'staff') return user;
    return deps.users.promoteToCreator(tx, user.id, invitation.inviter_id);
}
