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

export type RequestCodeOutcome = 'sent' | 'rate_limited';

export type ProfileOutcome =
    | { ok: true; user: UserDto }
    | { ok: false; fieldErrors: ProfileFieldErrors }
    | { ok: false; failure: ProfileFailure };

export interface ProfilePageData {
    user: UserDto;
    memberships: MembershipSummaryRow[];
}

// Five code requests per minute per address, as the Phoenix controller allowed.
const REQUEST_CODE_WINDOW_SECONDS = 60;
const REQUEST_CODE_MAX = 5;

/** The auth and profile flows, mapped for the pages that drive them. */
export interface AuthBff {
    requestCode(email: string, clientAddress: string): Promise<RequestCodeOutcome>;
    verifyCode(email: string, code: string): Promise<SignedInDto | null>;
    logout(token: string): Promise<void>;
    completeProfile(user: SessionUser, input: ProfileInput): Promise<ProfileOutcome>;
    currentUser(user: SessionUser): Promise<UserDto | null>;
    profilePage(user: SessionUser): Promise<ProfilePageData | null>;
    /** Who an impersonation link signs in as, or null when its token is dead. */
    impersonate(token: string): Promise<UserDto | null>;
    /** A fresh session token for `userId`, for an admin's "log in as" link. */
    mintImpersonation(userId: string): Promise<string | null>;
}

export interface AuthBffDeps {
    auth: AuthService;
    profile: ProfileService;
    users: UserRepository;
    organizations: OrganizationRepository;
    userMapper: UserMapper;
    rateLimiter: RateLimiter;
}

export function getAuthBff(deps: AuthBffDeps): AuthBff {
    authBff ??= {
        async requestCode(email, clientAddress) {
            const key = `request_code:${clientAddress}`;
            const verdict = deps.rateLimiter.check(
                key,
                REQUEST_CODE_WINDOW_SECONDS,
                REQUEST_CODE_MAX
            );
            if (!verdict.allowed) return 'rate_limited';
            await deps.auth.requestCode(email);
            return 'sent';
        },

        async verifyCode(email, code) {
            const signedIn = await deps.auth.verifyCode(email, code);
            return signedIn
                ? { token: signedIn.token, user: deps.userMapper.toDto(signedIn.user) }
                : null;
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

        async impersonate(token) {
            const row = await deps.auth.findUserByToken(token);
            return row ? deps.userMapper.toDto(row) : null;
        },

        async mintImpersonation(userId) {
            const row = await deps.users.findById(userId);
            return row ? deps.auth.createSession(row) : null;
        }
    };
    return authBff;
}

let authBff: AuthBff | null = null;
