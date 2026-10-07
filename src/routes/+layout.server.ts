import type { LayoutServerLoad } from './$types';

/**
 * What the navigation needs to know about the caller beyond who they are:
 * whether to offer "Scan". Phoenix used to answer this to the browser after
 * hydration; it is read here so no page depends on Phoenix being up.
 *
 * A database problem costs the menu entry, never the page.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
    if (!locals.user) return { scanStaff: false };
    try {
        return { scanStaff: await locals.container.organizations.isStaffAnywhere(locals.user) };
    } catch (cause) {
        const event = 'navigation_load_failed';
        console.error(JSON.stringify({ level: 'error', event, error: String(cause) }));
        return { scanStaff: false };
    }
};
