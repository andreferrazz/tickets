import type { Role } from '$lib/types';

/**
 * The caller behind a request, resolved from the session cookie. Deliberately
 * narrow: only what server-side authorization needs. Pages that show the user
 * load the full row themselves.
 */
export interface SessionUser {
    id: string;
    role: Role;
    /** False until the profile step is done; such a caller is sent there first. */
    profileComplete: boolean;
}
