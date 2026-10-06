import type { BrowserContext } from '@playwright/test';

// Mirrors SESSION_COOKIE in src/lib/modules/sessions/cookie.ts. Duplicated rather
// than imported because that module pulls in $app/environment, which only
// resolves inside Vite.
export const SESSION_COOKIE = 'tickets_session';

/** Signs the browser context in as the seeded user behind `token`. */
export async function signIn(context: BrowserContext, token: string): Promise<void> {
    await context.addCookies([
        { name: SESSION_COOKIE, value: token, url: 'http://localhost:5273' }
    ]);
}
