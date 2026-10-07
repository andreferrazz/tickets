import { toIso8601Utc } from '$lib/utils/datetime';
import type { InvitationDto, InvitationRow } from './types';

export interface InvitationMapper {
    toDto(row: InvitationRow): InvitationDto;
}

export function getInvitationMapper(): InvitationMapper {
    invitationMapper ??= {
        toDto(row) {
            return {
                id: row.id,
                inviterId: row.inviter_id,
                organizationId: row.organization_id,
                role: row.role,
                email: row.email,
                status: row.status,
                createdAt: toIso8601Utc(row.inserted_at)
            };
        }
    };
    return invitationMapper;
}

let invitationMapper: InvitationMapper | null = null;
