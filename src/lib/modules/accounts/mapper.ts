import { toIso8601Utc } from '$lib/utils/datetime';
import type { UserDto, UserRow } from './types';

export interface UserMapper {
    toDto(row: UserRow): UserDto;
}

export function getUserMapper(): UserMapper {
    return {
        toDto(row) {
            return {
                id: row.id,
                email: row.email,
                role: row.role,
                invitedBy: row.invited_by,
                name: row.name,
                cellphone: row.cellphone,
                taxId: row.tax_id,
                abacateCustomerId: row.abacate_customer_id,
                profileComplete: row.abacate_customer_id !== null,
                createdAt: toIso8601Utc(row.inserted_at)
            };
        }
    };
}
