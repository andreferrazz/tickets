/**
 * Thrown inside a transaction when attaching a `leader` membership finds the
 * organization already has one, so everything done for that invitation rolls
 * back. Callers catch it and decide what the user is told.
 */
export class LeaderExistsError extends Error {
    constructor(readonly organizationId: string) {
        super(`organization ${organizationId} already has a leader`);
        this.name = 'LeaderExistsError';
    }
}
