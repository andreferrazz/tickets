import { requireEnv } from './env';

/**
 * The name of the one organization this deployment serves: the brand in the
 * navigation, the page title and the sender name on every email. An
 * environment variable rather than a table row because nothing in the app
 * edits it yet.
 *
 * @example
 * const name = readOrganizationName(); // 'Grupo Scheilla'
 */
export function readOrganizationName(): string {
    return requireEnv(
        'ORG_NAME',
        "the organization's name as shown in the navigation and in emails"
    );
}
