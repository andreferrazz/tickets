import { defineConfig, devices } from '@playwright/test';
import { E2E_BASE_URL, E2E_PORT, E2E_SETUP_BASE_URL, E2E_SETUP_PORT } from './e2e/support/base-url';
import { E2E_BLANK_DATABASE_URL, E2E_DATABASE_URL } from './e2e/support/database';
import { ORGANIZATION_NAME } from './e2e/support/fixtures';
import { E2E_WEBHOOK_SECRET } from './e2e/support/webhook';

const SETUP_SPEC = /setup\.spec\.ts$/;

// Points a server at one of the e2e databases instead of the one in .env, so a
// run never reads or writes backend_dev, and at the fake integrations so a
// spec never reaches Abacate Pay or an SMTP server.
function serverEnvironment(databaseUrl: string): Record<string, string> {
    return {
        DATABASE_URL: databaseUrl,
        INTEGRATIONS: 'fake',
        // The one organization the seeded world belongs to; the brand the specs read.
        ORG_NAME: ORGANIZATION_NAME,
        // What the webhook specs put in the URL; without it every delivery is refused.
        ABACATE_PAY_WEBHOOK_SECRET: E2E_WEBHOOK_SECRET,
        // The specs run the sweep themselves (`/e2e-fakes/reconcile`); a timer
        // firing mid-run would expire rows another spec is still setting up.
        ORDER_RECONCILER: 'off',
        // A run requests more login codes in a minute than any person would.
        AUTH_CODE_RATE_LIMIT: '1000'
    };
}

export default defineConfig({
    testDir: 'e2e',
    // Keeps Playwright from treating the seed helpers under e2e/support as specs.
    testMatch: '**/*.spec.ts',
    globalSetup: './e2e/support/database.ts',
    forbidOnly: !!process.env.CI,
    // Specs create their own people and are safe to repeat; one retry in CI
    // separates a flaky runner from a real failure and records a trace.
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
    use: {
        trace: 'on-first-retry'
    },
    projects: [
        {
            name: 'chromium',
            testIgnore: SETUP_SPEC,
            use: { ...devices['Desktop Chrome'], baseURL: E2E_BASE_URL }
        },
        // The first-run spec alone, against the server on the blank database:
        // the seeded one always has an admin, which that spec must start without.
        {
            name: 'setup',
            testMatch: SETUP_SPEC,
            use: { ...devices['Desktop Chrome'], baseURL: E2E_SETUP_BASE_URL }
        }
    ],
    // Never reuse a server someone left on these ports: it would run with its
    // own environment, which may mean the real database and the live
    // payment and mail services.
    webServer: [
        {
            command: `npm run dev -- --port ${E2E_PORT} --strictPort`,
            port: E2E_PORT,
            reuseExistingServer: false,
            env: serverEnvironment(E2E_DATABASE_URL)
        },
        {
            command: `npm run dev -- --port ${E2E_SETUP_PORT} --strictPort`,
            port: E2E_SETUP_PORT,
            reuseExistingServer: false,
            env: serverEnvironment(E2E_BLANK_DATABASE_URL)
        }
    ]
});
