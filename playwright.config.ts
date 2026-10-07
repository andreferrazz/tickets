import { defineConfig, devices } from '@playwright/test';
import { E2E_BASE_URL, E2E_PORT } from './e2e/support/base-url';
import { E2E_DATABASE_URL } from './e2e/support/database';
import { E2E_WEBHOOK_SECRET } from './e2e/support/webhook';

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
        baseURL: E2E_BASE_URL,
        trace: 'on-first-retry'
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: {
        command: `npm run dev -- --port ${E2E_PORT} --strictPort`,
        port: E2E_PORT,
        // Never reuse a server someone left on this port: it would run with its
        // own environment, which may mean the real database and the live
        // payment and mail services.
        reuseExistingServer: false,
        // Points the app at the seeded database instead of the one in .env, so a
        // run never reads or writes backend_dev, and at the fake integrations so a
        // spec never reaches Abacate Pay or an SMTP server.
        env: {
            DATABASE_URL: E2E_DATABASE_URL,
            INTEGRATIONS: 'fake',
            // What the webhook specs put in the URL; without it every delivery is refused.
            ABACATE_PAY_WEBHOOK_SECRET: E2E_WEBHOOK_SECRET,
            // A run requests more login codes in a minute than any person would.
            AUTH_CODE_RATE_LIMIT: '1000'
        }
    }
});
