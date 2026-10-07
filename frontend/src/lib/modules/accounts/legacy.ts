import type { User } from '$lib/types';
import type { UserDto } from './types';

/**
 * The Phoenix `user_json/1` shape to the one this app uses. Transitional: it
 * serves sessions stored before the login flow moved here and the invitation
 * link flow, which still signs in through Phoenix until the organizations step.
 */
export function fromApiUser(user: User): UserDto {
    return {
        id: user.id,
        email: user.email,
        role: user.role,
        invitedBy: user.invited_by,
        name: user.name,
        cellphone: user.cellphone,
        taxId: user.tax_id,
        abacateCustomerId: user.abacate_customer_id,
        profileComplete: user.profile_complete,
        createdAt: user.created_at
    };
}
