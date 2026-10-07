import type { Page } from '@playwright/test';

/**
 * Resolves once the client has taken over the page. Forms that submit on
 * change, and buttons that intercept their own click, only behave once that
 * has happened; "network idle" is not the same thing under load.
 */
export async function waitForHydration(page: Page): Promise<void> {
    await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached' });
}
