import { expect, test } from '@playwright/test';
import {
    ADMIN_ORDER,
    CLOSED_EVENT,
    MEMBER,
    MEMBER_PAID_ORDER,
    MEMBER_PENDING_ORDER,
    MISSING_EVENT_ID,
    PUBLISHED_EVENT
} from './support/fixtures';
import { signIn } from './support/session';

test('an anonymous visitor is sent to log in and brought back afterwards', async ({ request }) => {
    const response = await request.get('/orders', { maxRedirects: 0 });

    expect(response.status()).toBe(303);
    expect(response.headers()['location']).toBe('/auth/login?next=%2Forders');
});

test('a buyer sees their own orders and nobody else’s', async ({ context, page }) => {
    await signIn(context, MEMBER.token);

    await page.goto('/orders');

    await expect(page.locator(`a[href="/orders/${MEMBER_PAID_ORDER.id}"]`)).toBeVisible();
    await expect(page.locator(`a[href="/orders/${MEMBER_PENDING_ORDER.id}"]`)).toBeVisible();
    await expect(page.locator(`a[href="/orders/${ADMIN_ORDER.id}"]`)).toHaveCount(0);
    await expect(page.getByText(CLOSED_EVENT.title)).toHaveCount(0);
});

// The list used to be fetched from Phoenix after hydration. Assert at the HTML
// level so that cannot come back, and so another buyer's order never leaks
// into the served markup either.
test('the order list is server-rendered', async ({ context, page }) => {
    await signIn(context, MEMBER.token);

    const html = await (await page.request.get('/orders')).text();

    expect(html).toContain(PUBLISHED_EVENT.title);
    expect(html).toContain(MEMBER_PAID_ORDER.id);
    expect(html).not.toContain(ADMIN_ORDER.id);
});

test('a paid order shows its items, total and one QR code per pass', async ({ context, page }) => {
    await signIn(context, MEMBER.token);

    const html = await (await page.request.get(`/orders/${MEMBER_PAID_ORDER.id}`)).text();

    expect(html).toContain('E2E Pista × 2');
    expect(html).toContain('246,90');
    expect(html.split('data:image/png;base64,').length - 1).toBe(2);
    // One of the two seeded passes has already been scanned.
    expect(html.split('Já validado').length - 1).toBe(1);
});

test('a pending order offers the payment link', async ({ context, page }) => {
    await signIn(context, MEMBER.token);

    await page.goto(`/orders/${MEMBER_PENDING_ORDER.id}`);

    await expect(page.getByRole('link', { name: 'Concluir pagamento' })).toHaveAttribute(
        'href',
        MEMBER_PENDING_ORDER.paymentUrl
    );
    await expect(page.locator('img[src^="data:image/png"]')).toHaveCount(0);
});

// 404 rather than 403 on purpose: the response must not confirm that another
// buyer's order exists.
test('another buyer’s order, a missing id and a malformed id are all 404', async ({
    context,
    page
}) => {
    await signIn(context, MEMBER.token);

    for (const id of [ADMIN_ORDER.id, MISSING_EVENT_ID, 'not-a-uuid']) {
        const response = await page.request.get(`/orders/${id}`);
        expect(response.status(), id).toBe(404);
        expect(await response.text()).not.toContain(CLOSED_EVENT.title);
    }
});
