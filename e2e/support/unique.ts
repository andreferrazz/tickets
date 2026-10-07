import { randomUUID } from 'node:crypto';

/**
 * An address no other test, retry or repeat has used. Specs create their own
 * people rather than share fixed ones, so they pass in any order and any
 * number of times against the same database.
 *
 * @example
 * const email = uniqueEmail('first-login'); // first-login-3f9a1c2e@e2e.test
 */
export function uniqueEmail(label: string): string {
    return `${label}-${randomUUID().slice(0, 8)}@e2e.test`;
}

export function uniqueToken(label: string): string {
    return `${label}-${randomUUID()}`;
}
