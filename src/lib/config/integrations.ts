import { env } from '$env/dynamic/private';

/**
 * Which implementations of the external services (Abacate Pay, mail) the server
 * is built with. `live` talks to the real services; `fake` uses the in-process
 * stand-ins the e2e suite relies on, so a spec never reaches a third party.
 */
export type IntegrationMode = 'live' | 'fake';

const MODES: readonly IntegrationMode[] = ['live', 'fake'];

/**
 * Reads `INTEGRATIONS` from the environment, defaulting to `live`.
 *
 * @example
 * const mode = resolveIntegrationMode(); // 'fake' when INTEGRATIONS=fake
 */
export function resolveIntegrationMode(): IntegrationMode {
    const raw = env.INTEGRATIONS ?? 'live';
    if (!isIntegrationMode(raw)) {
        throw new Error(`INTEGRATIONS must be one of ${MODES.join(' | ')}, got: ${raw}`);
    }
    // A fake payment provider in production would accept orders nobody paid for.
    if (raw === 'fake' && process.env.NODE_ENV === 'production') {
        throw new Error('INTEGRATIONS=fake is refused when NODE_ENV=production');
    }
    return raw;
}

function isIntegrationMode(value: string): value is IntegrationMode {
    return (MODES as readonly string[]).includes(value);
}
