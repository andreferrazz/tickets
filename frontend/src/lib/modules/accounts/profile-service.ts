import { AbacatePayError, describeAbacateFailure } from '$lib/integrations/abacate-pay/errors';
import type { AbacatePayGateway } from '$lib/integrations/abacate-pay/gateway';
import type { SessionUser } from '$lib/modules/sessions/types';
import { validateProfile, type ProfileFieldErrors, type ProfileInput } from './profile-validation';
import type { UserRepository } from './repository';
import type { UserRow } from './types';

export type ProfileFailure = 'invalid_profile_data' | 'abacate_unavailable';

export type ProfileResult =
    | { ok: true; user: UserRow }
    | { ok: false; fieldErrors: ProfileFieldErrors }
    | { ok: false; failure: ProfileFailure };

/**
 * The post-signup profile step, as `Backend.Accounts.complete_profile/2` did
 * it: validate locally, register the customer with Abacate Pay, and only then
 * write name, cellphone, tax id and customer id to the row in one update.
 */
export interface ProfileService {
    completeProfile(user: SessionUser, input: ProfileInput): Promise<ProfileResult>;
}

export interface ProfileServiceDeps {
    users: UserRepository;
    abacatePay: AbacatePayGateway;
}

export function getProfileService(deps: ProfileServiceDeps): ProfileService {
    return {
        async completeProfile(sessionUser, input) {
            const validated = validateProfile(input);
            if (!validated.ok) return validated;
            const user = await deps.users.findById(sessionUser.id);
            if (!user) return { ok: false, failure: 'invalid_profile_data' };
            try {
                const customerId = await deps.abacatePay.createCustomer({
                    email: user.email,
                    name: validated.value.name,
                    cellphone: validated.value.cellphone,
                    taxId: validated.value.taxId
                });
                const updated = await deps.users.completeProfile(
                    user.id,
                    validated.value,
                    customerId
                );
                return { ok: true, user: updated };
            } catch (cause) {
                console.warn(
                    JSON.stringify({
                        event: 'abacate_customer_create_failed',
                        ...describeAbacateFailure(cause)
                    })
                );
                return { ok: false, failure: classify(cause) };
            }
        }
    };
}

// A 4xx is our data (surface it); a 401 means our key, not their data. Anything
// else is Abacate or the network and the user should simply retry later.
function classify(cause: unknown): ProfileFailure {
    if (
        cause instanceof AbacatePayError &&
        cause.failure === 'invalid_data' &&
        cause.status !== 401
    ) {
        return 'invalid_profile_data';
    }
    return 'abacate_unavailable';
}
