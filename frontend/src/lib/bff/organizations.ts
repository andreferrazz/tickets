import type { InvitationMapper } from '$lib/modules/invitations/mapper';
import type { InvitationService } from '$lib/modules/invitations/service';
import type { InvitationDto } from '$lib/modules/invitations/types';
import type { OrganizationMapper } from '$lib/modules/organizations/mapper';
import type { OrganizationService } from '$lib/modules/organizations/service';
import type { ManagerRole, OrganizationDto, OrgMemberDto } from '$lib/modules/organizations/types';
import type { SessionUser } from '$lib/modules/sessions/types';

export interface OrganizationTeamData {
    /** Null when the organization does not exist or `user` may not manage it. */
    organization: OrganizationDto | null;
    managerRole: ManagerRole | null;
    members: OrgMemberDto[];
    /** Only the invitations into this organization. */
    invitations: InvitationDto[];
    loadFailed: boolean;
}

export interface OrganizationsBff {
    /** Everything the invitations and members page of one organization shows. */
    team(user: SessionUser, organizationId: string): Promise<OrganizationTeamData>;
}

export interface OrganizationsBffDeps {
    organizations: OrganizationService;
    organizationMapper: OrganizationMapper;
    invitations: InvitationService;
    invitationMapper: InvitationMapper;
}

export function getOrganizationsBff(deps: OrganizationsBffDeps): OrganizationsBff {
    organizationsBff ??= {
        async team(user, organizationId) {
            try {
                const managerRole = await deps.organizations.managerRoleFor(user, organizationId);
                const organization = managerRole
                    ? await deps.organizations.findById(organizationId)
                    : null;
                if (!managerRole || !organization) return denied();
                const [members, invitations] = await Promise.all([
                    deps.organizations.listMembers(organization.id),
                    deps.invitations.listVisible(user)
                ]);
                return {
                    organization: deps.organizationMapper.toOrganizationDto(organization),
                    managerRole,
                    members: members.map((row) => deps.organizationMapper.toMemberDto(row)),
                    invitations: invitations
                        .filter((row) => row.organization_id === organization.id)
                        .map((row) => deps.invitationMapper.toDto(row)),
                    loadFailed: false
                };
            } catch (cause) {
                console.error(
                    JSON.stringify({
                        event: 'organization_team_load_failed',
                        organizationId,
                        error: String(cause)
                    })
                );
                return { ...denied(), loadFailed: true };
            }
        }
    };
    return organizationsBff;
}

function denied(): OrganizationTeamData {
    return {
        organization: null,
        managerRole: null,
        members: [],
        invitations: [],
        loadFailed: false
    };
}

let organizationsBff: OrganizationsBff | null = null;
