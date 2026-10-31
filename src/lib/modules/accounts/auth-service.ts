import { randomBytes, randomInt } from 'node:crypto';
import type { Queryable } from '$lib/db/queryable';
import type { Mailer } from '$lib/integrations/mail/mailer';
import type { InvitationRepository } from '$lib/modules/invitations/repository';
import type { SessionRepository } from '$lib/modules/sessions/repository';
import { authCodeEmail, CODE_TTL_MINUTES } from './auth-code-email';
import type { AuthCodeRepository } from './auth-code-repository';
import type { UserRepository } from './repository';
import { higherRole } from './roles';
import type { UserRow } from './types';

export const SESSION_TTL_DAYS = 30;

export interface SignedIn {
    token: string;
    user: UserRow;
}

/**
 * Passwordless login as `Backend.Accounts` ran it: a 6-digit code by email,
 * then a 30-day session. Verifying a code finds or creates the buyer and, when
 * a pending invitation names their email, raises their role to the invited
 * one in the same transaction.
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
    mailer: Mailer;
    /** Signs the login email. */
    organizationName: string;
}

export function getAuthService(deps: AuthServiceDeps): AuthService {
    return {
        async requestCode(rawEmail) {
            const email = normalizeEmail(rawEmail);
            const code = String(randomInt(100_000, 1_000_000));
            await deps.authCodes.replacePending(email, code, CODE_TTL_MINUTES);
            await deps.mailer.send(authCodeEmail(email, code, deps.organizationName));
        },

        async verifyCode(rawEmail, code) {
            const email = normalizeEmail(rawEmail);
            // Claimed up front, in one statement: a code is spent the moment it is
            // presented, whatever happens next.
            if (!(await deps.authCodes.claim(email, code))) return null;
            const existing = await deps.users.findByEmail(email);
            const user = await acceptIfInvited(
                deps,
                existing ?? (await deps.users.insertBuyer(email))
            );
            const token = await this.createSession(user);
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

// A pending invitation for the email is consumed on login: the role is raised
// to the invited one (never lowered) and the invitation marked accepted, all
// or nothing.
async function acceptIfInvited(deps: AuthServiceDeps, user: UserRow): Promise<UserRow> {
    const invitation = await deps.invitations.findPendingByEmail(user.email);
    if (!invitation) return user;
    return deps.queryable.transaction(async (tx) => {
        const role = higherRole(user.role, invitation.role);
        const updated =
            role === user.role
                ? user
                : await deps.users.setRole(tx, user.id, role, invitation.inviter_id);
        await deps.invitations.markAccepted(tx, invitation.id);
        return updated;
    });
}
