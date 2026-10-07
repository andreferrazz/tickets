import type { BrowserContext } from '@playwright/test';
import { E2E_BASE_URL } from './base-url';

// Mirrors SESSION_COOKIE in src/lib/modules/sessions/cookie.ts. Duplicated rather
// than imported because that module pulls in $app/environment, which only
// resolves inside Vite.
export const SESSION_COOKIE = 'tickets_session';

/**
 * Signs the browser context in as the user behind `token`. The seeded tokens
 * are shared by every spec: never log one of them out, mint a session with
 * `seedSession` instead.
 */
export async function signIn(context: BrowserContext, token: string): Promise<void> {
    await context.addCookies([{ name: SESSION_COOKIE, value: token, url: E2E_BASE_URL }]);
}
