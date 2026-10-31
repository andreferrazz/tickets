import { canLeadTeam, canManageEvents, canScan } from '$lib/modules/accounts/roles';
import type { LayoutServerLoad } from './$types';

/**
 * What every page needs beyond who the caller is: the organization's name for
 * the brand and the title, and which navigation entries the caller's role
 * earns. All answered from the session, so no page pays a query for it.
 */
export const load: LayoutServerLoad = ({ locals }) => {
    const role = locals.user?.role ?? null;
    return {
        organizationName: locals.container.organizationName,
        canManageEvents: role !== null && canManageEvents(role),
        canLeadTeam: role !== null && canLeadTeam(role),
        canScan: role !== null && canScan(role)
    };
};
