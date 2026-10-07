import { logLoadFailure } from './load-failure';
import type { UserMapper } from '$lib/modules/accounts/mapper';
import type { UserRepository } from '$lib/modules/accounts/repository';
import type { UserDto } from '$lib/modules/accounts/types';
import type { InvitationMapper } from '$lib/modules/invitations/mapper';
import type { InvitationService } from '$lib/modules/invitations/service';
import type { InvitationDto } from '$lib/modules/invitations/types';
import type { SessionUser } from '$lib/modules/sessions/types';

export interface AdminInvitationsData {
    invitations: InvitationDto[];
    loadFailed: boolean;
}

export interface AdminUsersData {
    users: UserDto[];
    loadFailed: boolean;
}

/** The admin-only pages. Callers check the role first; these only load. */
export interface AdminBff {
    invitations(user: SessionUser): Promise<AdminInvitationsData>;
    users(): Promise<AdminUsersData>;
}

export interface AdminBffDeps {
    invitations: InvitationService;
    invitationMapper: InvitationMapper;
    users: UserRepository;
    userMapper: UserMapper;
}

export function getAdminBff(deps: AdminBffDeps): AdminBff {
    return {
        async invitations(user) {
            try {
                const rows = await deps.invitations.listVisible(user);
                return {
                    invitations: rows.map((row) => deps.invitationMapper.toDto(row)),
                    loadFailed: false
                };
            } catch (cause) {
                logLoadFailure('admin_invitations_load_failed', {}, cause);
                return { invitations: [], loadFailed: true };
            }
        },

        async users() {
            try {
                const rows = await deps.users.listUsers();
                return { users: rows.map((row) => deps.userMapper.toDto(row)), loadFailed: false };
            } catch (cause) {
                logLoadFailure('admin_users_load_failed', {}, cause);
                return { users: [], loadFailed: true };
            }
        }
    };
}
