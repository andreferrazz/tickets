import { randomBytes } from 'node:crypto';
import type { ImpersonationRepository } from '$lib/modules/accounts/impersonation-repository';
import { normalizeEmail } from '$lib/modules/accounts/auth-service';
import { isEmailAddress } from '$lib/utils/email';
import { isUuid } from '$lib/utils/uuid';
import type { UserMapper } from '$lib/modules/accounts/mapper';
import type { AuthService } from '$lib/modules/accounts/auth-service';
import type { ProfileService } from '$lib/modules/accounts/profile-service';
import type { ProfileFieldErrors, ProfileInput } from '$lib/modules/accounts/profile-validation';
import type { ProfileFailure } from '$lib/modules/accounts/profile-service';
import type { RateLimiter } from '$lib/modules/accounts/rate-limit';
import type { UserRepository } from '$lib/modules/accounts/repository';
import type { UserDto } from '$lib/modules/accounts/types';
import type { OrganizationRepository } from '$lib/modules/organizations/repository';
import type { MembershipSummaryRow } from '$lib/modules/organizations/types';
import type { SessionUser } from '$lib/modules/sessions/types';

export interface SignedInDto {
    token: string;
    user: UserDto;
}

export type RequestCodeOutcome = 'sent' | 'rate_limited' | 'invalid_email';

export type VerifyOutcome =
    { ok: true; signedIn: SignedInDto } | { ok: false; failure: 'invalid_code' | 'rate_limited' };

export type ProfileOutcome =
    | { ok: true; user: UserDto }
    | { ok: false; fieldErrors: ProfileFieldErrors }
    | { ok: false; failure: ProfileFailure };

export interface ProfilePageData {
    user: UserDto;
    memberships: MembershipSummaryRow[];
}

const REQUEST_CODE_WINDOW_SECONDS = 60;
// As long as a code lives, so the guesses allowed against one code are bounded.
const VERIFY_WINDOW_SECONDS = 600;
// An address may try several emails (a shared office), but not without limit.
const VERIFY_PER_ADDRESS_FACTOR = 6;
const IMPERSONATION_TTL_MINUTES = 10;

/** The auth and profile flows, mapped for the pages that drive them. */
export interface AuthBff {
    requestCode(email: string, clientAddress: string): Promise<RequestCodeOutcome>;
    verifyCode(email: string, code: string, clientAddress: string): Promise<VerifyOutcome>;
    logout(token: string): Promise<void>;
    completeProfile(user: SessionUser, input: ProfileInput): Promise<ProfileOutcome>;
    currentUser(user: SessionUser): Promise<UserDto | null>;
    profilePage(user: SessionUser): Promise<ProfilePageData | null>;
    /** Who a live impersonation link is for, without consuming it. */
    impersonationTarget(token: string): Promise<UserDto | null>;
    /** Consumes an impersonation link and signs in as its user; null when the link is dead. */
    impersonate(token: string): Promise<SignedInDto | null>;
    /** A single-use, ten-minute link token for `userId`. Callers check `admin` is one. */
    mintImpersonation(admin: SessionUser, userId: string): Promise<string | null>;
}

export interface AuthBffDeps {
    auth: AuthService;
    profile: ProfileService;
    users: UserRepository;
    organizations: OrganizationRepository;
    userMapper: UserMapper;
    rateLimiter: RateLimiter;
    /** Code requests allowed per address per minute; five is what Phoenix allowed. */
    requestCodeLimit: number;
    /** Guesses allowed per email while one code is alive. */
    verifyAttemptLimit: number;
    impersonations: ImpersonationRepository;
}

export function getAuthBff(deps: AuthBffDeps): AuthBff {
    authBff ??= {
        async requestCode(email, clientAddress) {
            const key = `request_code:${clientAddress}`;
            const verdict = deps.rateLimiter.check(
                key,
                REQUEST_CODE_WINDOW_SECONDS,
                deps.requestCodeLimit
            );
            if (!verdict.allowed) return 'rate_limited';
            if (!isEmailAddress(normalizeEmail(email))) return 'invalid_email';
            await deps.auth.requestCode(email);
            return 'sent';
        },

        async verifyCode(email, code, clientAddress) {
            if (!mayVerify(deps, normalizeEmail(email), clientAddress)) {
                return { ok: false, failure: 'rate_limited' };
            }
            const signedIn = await deps.auth.verifyCode(email, code);
            if (!signedIn) return { ok: false, failure: 'invalid_code' };
            return {
                ok: true,
                signedIn: { token: signedIn.token, user: deps.userMapper.toDto(signedIn.user) }
            };
        },

        logout: (token) => deps.auth.logout(token),

        async completeProfile(user, input) {
            const result = await deps.profile.completeProfile(user, input);
            return result.ok ? { ok: true, user: deps.userMapper.toDto(result.user) } : result;
        },

        async currentUser(user) {
            const row = await deps.users.findById(user.id);
            return row ? deps.userMapper.toDto(row) : null;
        },

        async profilePage(user) {
            const [row, memberships] = await Promise.all([
                deps.users.findById(user.id),
                deps.organizations.listMembershipsForUser(user.id)
            ]);
            return row ? { user: deps.userMapper.toDto(row), memberships } : null;
        },

        async impersonationTarget(token) {
            const userId = await deps.impersonations.findLiveUserId(token);
            const row = userId ? await deps.users.findById(userId) : null;
            return row ? deps.userMapper.toDto(row) : null;
        },

        async impersonate(token) {
            const userId = await deps.impersonations.claim(token);
            const row = userId ? await deps.users.findById(userId) : null;
            if (!row) return null;
            return { token: await deps.auth.createSession(row), user: deps.userMapper.toDto(row) };
        },

        async mintImpersonation(admin, userId) {
            if (!isUuid(userId) || !(await deps.users.findById(userId))) return null;
            const token = randomBytes(32).toString('base64url');
            await deps.impersonations.insert({
                token,
                userId,
                createdById: admin.id,
                ttlMinutes: IMPERSONATION_TTL_MINUTES
            });
            return token;
        }
    };
    return authBff;
}

// Both buckets are charged on every attempt, so a refused attempt still counts.
function mayVerify(deps: AuthBffDeps, email: string, clientAddress: string): boolean {
    const byEmail = deps.rateLimiter.check(
        `verify_code:${email}`,
        VERIFY_WINDOW_SECONDS,
        deps.verifyAttemptLimit
    );
    const byAddress = deps.rateLimiter.check(
        `verify_code_address:${clientAddress}`,
        REQUEST_CODE_WINDOW_SECONDS,
        deps.requestCodeLimit * VERIFY_PER_ADDRESS_FACTOR
    );
    return byEmail.allowed && byAddress.allowed;
}

let authBff: AuthBff | null = null;
