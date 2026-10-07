import { toIso8601Utc } from '$lib/utils/datetime';
import type { MemberRow, OrganizationDto, OrganizationRow, OrgMemberDto } from './types';

/** Organization and member rows to the camelCase shapes the pages render. */
export interface OrganizationMapper {
    toOrganizationDto(row: OrganizationRow): OrganizationDto;
    toMemberDto(row: MemberRow): OrgMemberDto;
}

export function getOrganizationMapper(): OrganizationMapper {
    return {
        toOrganizationDto(row) {
            return {
                id: row.id,
                name: row.name,
                pixKey: row.pix_key,
                pixKeyType: row.pix_key_type,
                createdAt: toIso8601Utc(row.inserted_at),
                updatedAt: toIso8601Utc(row.updated_at)
            };
        },
        toMemberDto(row) {
            return { userId: row.user_id, email: row.email, role: row.role };
        }
    };
}
