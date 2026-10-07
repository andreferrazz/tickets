import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { DRAFT_ORG, MEMBER, OTHER_ORG_DRAFT } from './support/fixtures';
import { postFormAction, type ActionAnswer } from './support/form-action';
import { waitForHydration } from './support/hydration';
import { seedPerson } from './support/people';
import { withoutScripts } from './support/html';
import { signIn } from './support/session';
import { execute, queryValue } from './support/sql';

/** Creates a draft through the real form and lands on its edit page. Returns the id. */
async function createEvent(page: Page, title: string): Promise<string> {
    await page.goto('/events/new');
    await page.getByLabel('Título').fill(title);
    await page.getByLabel('Local').fill('Sao Paulo');
    await page.getByLabel('Início').fill('2027-08-01T20:00');
    await page.getByRole('button', { name: 'Criar evento' }).click();
    await expect(page).toHaveURL(/\/events\/[0-9a-f-]+\/edit$/);
    // The edit page's buttons intercept their own clicks, which needs the client.
    await waitForHydration(page);
    return page.url().split('/').at(-2) as string;
}

/** Posts one of the edit page's actions directly, as the row forms do. */
function postAction(
    context: BrowserContext,
    eventId: string,
    action: string,
    form: Record<string, string>
): Promise<ActionAnswer> {
    return postFormAction(context.request, `/events/${eventId}/edit?/${action}`, form);
}

test.beforeEach(async ({ context }) => signIn(context, MEMBER.token));

test('a creator builds an event: ticket type, priced and free batches, close, publish', async ({
    page
}) => {
    const eventId = await createEvent(page, 'E2E Built Show');

    const ticketTypeForm = page.locator('form[action="?/addTicketType"]');
    await ticketTypeForm.getByLabel('Nome').fill('Pista VIP');
    await ticketTypeForm.getByRole('button', { name: 'Adicionar' }).click();
    await expect(page.getByRole('heading', { name: 'Lotes' })).toBeVisible();

    const batchForm = page.locator('form[action="?/addBatch"]');
    await batchForm.getByLabel('Preço').fill('50,00');
    await batchForm.getByLabel('Qtde').fill('20');
    await batchForm.getByRole('button', { name: 'Adicionar lote' }).click();
    await expect(page.locator('form[action="?/updateBatch"]').getByText('Lote 1')).toBeVisible();

    // A priced batch is written together with its Abacate product id.
    const productId = await queryValue<string>(
        `select b.abacate_product_id from ticket_batches b join ticket_types t on t.id = b.ticket_type_id
         where t.event_id = $1 and b.sequence = 1`,
        [eventId]
    );
    expect(productId).toMatch(/^prod_fake_batch_/);

    await batchForm.getByLabel('Preço').fill('0,00');
    await batchForm.getByLabel('Qtde').fill('5');
    await batchForm.getByRole('button', { name: 'Adicionar lote' }).click();
    await expect(page.locator('form[action="?/updateBatch"]').getByText('Lote 2')).toBeVisible();
    // A free batch has nothing to sell through Abacate, so no product.
    const freeProduct = await queryValue<string>(
        `select b.abacate_product_id from ticket_batches b join ticket_types t on t.id = b.ticket_type_id
         where t.event_id = $1 and b.sequence = 2`,
        [eventId]
    );
    expect(freeProduct).toBeNull();

    await page.getByRole('button', { name: 'Encerrar lote' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Encerrar lote' }).click();
    // The confirm dialog submits the row form; the close lands a moment later.
    await expect
        .poll(() =>
            queryValue<string>(
                `select b.closed_at::text from ticket_batches b join ticket_types t on t.id = b.ticket_type_id
                 where t.event_id = $1 and b.sequence = 1`,
                [eventId]
            )
        )
        .not.toBeNull();

    await page.getByLabel('Status').selectOption('published');
    await page.getByRole('button', { name: 'Salvar evento' }).click();
    await expect
        .poll(() => queryValue<string>('select status from events where id = $1', [eventId]))
        .toBe('published');
    const home = await (await page.request.get('/')).text();
    const homeMarkup = withoutScripts(home);
    expect(homeMarkup).toContain('E2E Built Show');
});

test('extras get products, and a section only goes once it is empty', async ({ page, context }) => {
    const eventId = await createEvent(page, 'E2E Extras Show');
    const sectionId = await queryValue<string>(
        'select id from extra_item_sections where event_id = $1 and deleted_at is null',
        [eventId]
    );
    expect(sectionId).not.toBeNull();

    const added = await postAction(context, eventId, 'addExtra', {
        event_id: eventId,
        section_id: sectionId as string,
        name: 'Camiseta',
        price: '30,00',
        quantity_total: '10'
    });
    expect(added.type).toBe('success');
    expect(
        await queryValue<string>('select abacate_product_id from extra_items where event_id = $1', [
            eventId
        ])
    ).toMatch(/^prod_fake_extra_/);

    const refused = await postAction(context, eventId, 'deleteSection', {
        id: sectionId as string
    });
    expect(refused.type).toBe('failure');
    expect(refused.data.error).toBe('section_not_empty');

    const extraId = await queryValue<string>('select id from extra_items where event_id = $1', [
        eventId
    ]);
    expect(
        (await postAction(context, eventId, 'deleteExtra', { id: extraId as string })).type
    ).toBe('success');
    expect(
        (await postAction(context, eventId, 'deleteSection', { id: sectionId as string })).type
    ).toBe('success');
    expect(
        await queryValue<string>('select deleted_at::text from extra_item_sections where id = $1', [
            sectionId
        ])
    ).not.toBeNull();
});

test('a batch with sales cannot be deleted', async ({ page, context }) => {
    const eventId = await createEvent(page, 'E2E Sold Show');
    await postAction(context, eventId, 'addTicketType', { event_id: eventId, name: 'Pista' });
    const ticketTypeId = await queryValue<string>(
        'select id from ticket_types where event_id = $1',
        [eventId]
    );
    await postAction(context, eventId, 'addBatch', {
        ticket_type_id: ticketTypeId as string,
        price: '10,00',
        quantity_total: '3'
    });
    const batchId = await queryValue<string>(
        'select id from ticket_batches where ticket_type_id = $1',
        [ticketTypeId]
    );
    // A sale is a stock movement, not something this page makes; pretend one happened.
    await execute('update ticket_batches set quantity_sold = 1 where id = $1', [batchId]);

    const refused = await postAction(context, eventId, 'deleteBatch', { id: batchId as string });

    expect(refused.type).toBe('failure');
    expect(refused.data.error).toBe('batch_has_sales');
});

test('an event of another organization cannot be edited', async ({ page }) => {
    const response = await page.request.get(`/events/${OTHER_ORG_DRAFT.id}/edit`);
    expect(response.status()).toBe(404);
});

// Phoenix kept creation behind the creator role; managing an organization is
// not enough for a member whose own role is still `buyer`.
test('a buyer who manages an organization still cannot create an event', async ({ browser }) => {
    const buyer = await seedPerson({
        role: 'buyer',
        membership: { organizationId: DRAFT_ORG.id, role: 'participant' }
    });
    const context = await browser.newContext();
    await signIn(context, buyer.token);

    const answer = await postFormAction(context.request, '/events/new?/create', {
        title: 'E2E Forbidden Show',
        starts_at: '2027-08-01T20:00:00Z',
        status: 'draft'
    });

    expect(answer.type).toBe('failure');
    expect(answer.data.error).toBe('forbidden');
    expect(
        await queryValue<string>(`select id from events where title = 'E2E Forbidden Show'`, [])
    ).toBeNull();
    await context.close();
});
