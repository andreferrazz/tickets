import { requireEnv } from './env';

export interface AbacatePayConfig {
    apiKey: string;
    baseUrl: string;
}

const ABACATE_PAY_BASE_URL = 'https://api.abacatepay.com/v2';

/** Settings the live Abacate Pay client needs; only read when INTEGRATIONS=live. */
export function readAbacatePayConfig(): AbacatePayConfig {
    return {
        apiKey: requireEnv(
            'ABACATE_PAY_API_KEY',
            'the seller API key from the Abacate Pay dashboard'
        ),
        baseUrl: ABACATE_PAY_BASE_URL
    };
}
