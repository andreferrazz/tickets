import type { Queryable } from '$lib/db/queryable';
import { isEmailAddress } from '$lib/utils/email';
import { normalizeEmail } from './auth-service';
import type { UserRepository } from './repository';

export type SetupFailure = 'invalid_email' | 'already_set_up';

export type SetupResult = { ok: true; email: string } | { ok: false; failure: SetupFailure };

/**
 * The first run of a fresh database: until an admin exists nobody can invite
 * anyone, so the first visitor names the admin. Creating the row is all this
 * does; the email is proven by the normal login code afterwards, which is why
 * no session is minted here.
 *
 * @example
 * if (!(await setup.adminExists())) redirect(303, '/setup');
 */
export interface SetupService {
    /** True once any admin exists. Cached in process after the first true answer. */
    adminExists(): Promise<boolean>;
    /** Makes `email` the admin: a new row, or the role on the row that already has that address. */
    createAdmin(email: string): Promise<SetupResult>;
}

export interface SetupServiceDeps {
    queryable: Queryable;
    users: UserRepository;
}

export function getSetupService(deps: SetupServiceDeps): SetupService {
    // Only ever flips to true: an admin is never demoted by the app, so once
    // one exists the question need not reach the database again.
    let known = false;

    const service: SetupService = {
        async adminExists() {
            if (!known) known = await deps.users.hasAdmin();
            return known;
        },

        async createAdmin(rawEmail) {
            const email = normalizeEmail(rawEmail);
            if (!isEmailAddress(email)) return { ok: false, failure: 'invalid_email' };
            if (await service.adminExists()) return { ok: false, failure: 'already_set_up' };
            const existing = await deps.users.findByEmail(email);
            if (existing) await deps.users.setRole(deps.queryable, existing.id, 'admin');
            else await deps.users.insertAdmin(email);
            known = true;
            return { ok: true, email };
        }
    };
    return service;
}
