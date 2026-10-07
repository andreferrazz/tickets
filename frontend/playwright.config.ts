import { defineConfig, devices } from '@playwright/test';
import { E2E_DATABASE_URL } from './e2e/support/database';

const PORT = 5273;

export default defineConfig({
    testDir: 'e2e',
    // Keeps Playwright from treating the seed helpers under e2e/support as specs.
    testMatch: '**/*.spec.ts',
    globalSetup: './e2e/support/database.ts',
    forbidOnly: !!process.env.CI,
    reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: `http://localhost:${PORT}`,
        trace: 'on-first-retry'
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: {
        command: `npm run dev -- --port ${PORT} --strictPort`,
        port: PORT,
        reuseExistingServer: !process.env.CI,
        // Points the app at the seeded database instead of the one in .env, so a
        // run never reads or writes backend_dev, and at the fake integrations so a
        // spec never reaches Abacate Pay or an SMTP server. PUBLIC_API_URL is only
        // here because lib/api.ts refuses to load without it; nothing in e2e calls
        // Phoenix, and the variable goes with it in the last migration step.
        env: {
            DATABASE_URL: E2E_DATABASE_URL,
            INTEGRATIONS: 'fake',
            // A run requests more login codes in a minute than any person would.
            AUTH_CODE_RATE_LIMIT: '1000',
            PUBLIC_API_URL: process.env.PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'
        }
    }
});
