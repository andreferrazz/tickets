import { logLoadFailure } from './load-failure';
import type { UserMapper } from '$lib/modules/accounts/mapper';
import type { UserRepository } from '$lib/modules/accounts/repository';
import type { UserDto } from '$lib/modules/accounts/types';

export interface AdminUsersData {
    users: UserDto[];
    loadFailed: boolean;
}

/** The admin-only pages. Callers check the role first; these only load. */
export interface AdminBff {
    users(): Promise<AdminUsersData>;
}

export interface AdminBffDeps {
    users: UserRepository;
    userMapper: UserMapper;
}

export function getAdminBff(deps: AdminBffDeps): AdminBff {
    return {
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
