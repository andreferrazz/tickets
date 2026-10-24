import { logLoadFailure } from './load-failure';
import type { TeamService } from '$lib/modules/accounts/team-service';
import type { UserRow } from '$lib/modules/accounts/types';
import type { InvitationMapper } from '$lib/modules/invitations/mapper';
import type { InvitationService } from '$lib/modules/invitations/service';
import type { InvitationDto } from '$lib/modules/invitations/types';
import type { SessionUser } from '$lib/modules/sessions/types';
import type { Role } from '$lib/types';

export interface TeamMemberDto {
    userId: string;
    email: string;
    name: string | null;
    role: Role;
}

export interface TeamPageData {
    members: TeamMemberDto[];
    invitations: InvitationDto[];
    loadFailed: boolean;
}

/** The team page: everyone with a role, and every invitation. Callers check the role first. */
export interface TeamBff {
    page(user: SessionUser): Promise<TeamPageData>;
}

export interface TeamBffDeps {
    team: TeamService;
    invitations: InvitationService;
    invitationMapper: InvitationMapper;
}

export function getTeamBff(deps: TeamBffDeps): TeamBff {
    return {
        async page(user) {
            try {
                const [members, invitations] = await Promise.all([
                    deps.team.listTeam(),
                    deps.invitations.listVisible(user)
                ]);
                return {
                    members: members.map(toMemberDto),
                    invitations: invitations.map((row) => deps.invitationMapper.toDto(row)),
                    loadFailed: false
                };
            } catch (cause) {
                logLoadFailure('team_page_load_failed', {}, cause);
                return { members: [], invitations: [], loadFailed: true };
            }
        }
    };
}

function toMemberDto(row: UserRow): TeamMemberDto {
    return { userId: row.id, email: row.email, name: row.name, role: row.role };
}
