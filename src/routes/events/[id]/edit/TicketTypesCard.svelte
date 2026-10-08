<script lang="ts">
    import { enhance } from '$app/forms';
    import FloatingField from '$lib/components/FloatingField.svelte';
    import { t } from '$lib/i18n';
    import { formatCentsInput } from '$lib/utils/currency';
    import type { PageData } from './$types';
    import { confirmThenSubmit, saveOnChange, submitNewRow, submitRow } from './row-forms';

    // What the event sells as tickets: each type with its batches, every row a
    // form of its own (see row-forms.ts).
    let { event }: { event: NonNullable<PageData['event']> } = $props();
</script>

<div class="card stack" style="margin: 1rem 0;">
    <h2>{t('eventEdit.ticketTypes')}</h2>
    {#each event.ticketTypes as tk (tk.id)}
        <div class="ticket-type">
            <form method="POST" action="?/updateTicketType" class="add" use:enhance={submitRow}>
                <input type="hidden" name="id" value={tk.id} />
                <FloatingField label={t('common.name')}>
                    <input name="name" placeholder=" " value={tk.name} onchange={saveOnChange} />
                </FloatingField>
                <button
                    type="submit"
                    class="danger small"
                    formaction="?/deleteTicketType"
                    onclick={(e) =>
                        confirmThenSubmit(
                            e,
                            t('eventEdit.confirmDeleteTicket', { name: tk.name }),
                            t('common.delete')
                        )}>{t('common.delete')}</button
                >
            </form>

            <h3 class="batches-head">{t('eventEdit.batches')}</h3>
            {#each tk.batches as b (b.id)}
                {@const isActive = tk.activeBatch?.id === b.id}
                {@const status = b.closedAt
                    ? t('eventEdit.batchClosed')
                    : isActive
                      ? t('eventEdit.batchActive')
                      : t('eventEdit.batchUpcoming')}
                <form
                    method="POST"
                    action="?/updateBatch"
                    class="add batch-row"
                    use:enhance={submitRow}
                >
                    <input type="hidden" name="id" value={b.id} />
                    <div class="batch-label">
                        <strong>{b.label}</strong>
                        <span class="muted small">{status}</span>
                    </div>
                    <FloatingField label={t('eventEdit.priceCents')}>
                        <input
                            name="price"
                            type="text"
                            inputmode="numeric"
                            placeholder=" "
                            disabled={!!b.closedAt}
                            value={formatCentsInput(b.priceCents)}
                            onchange={saveOnChange}
                        />
                    </FloatingField>
                    <FloatingField label={t('eventEdit.qty')}>
                        <input
                            name="quantity_total"
                            type="number"
                            placeholder=" "
                            disabled={!!b.closedAt}
                            value={b.quantityTotal}
                            onchange={saveOnChange}
                        />
                    </FloatingField>
                    <div class="muted small">
                        {b.quantitySold}/{b.quantityTotal}
                        {t('eventEdit.sold')}
                    </div>
                    {#if isActive}
                        <button
                            type="submit"
                            class="secondary small"
                            formaction="?/closeBatch"
                            onclick={(e) =>
                                confirmThenSubmit(
                                    e,
                                    t('eventEdit.confirmCloseBatch', { label: b.label }),
                                    t('eventEdit.closeBatch')
                                )}>{t('eventEdit.closeBatch')}</button
                        >
                    {:else if b.quantitySold === 0}
                        <button
                            type="submit"
                            class="danger small"
                            formaction="?/deleteBatch"
                            onclick={(e) =>
                                confirmThenSubmit(
                                    e,
                                    t('eventEdit.confirmDeleteBatch', { label: b.label }),
                                    t('common.delete')
                                )}>{t('common.delete')}</button
                        >
                    {/if}
                </form>
            {/each}
            <form
                method="POST"
                action="?/addBatch"
                class="add batch-row"
                use:enhance={submitNewRow}
            >
                <input type="hidden" name="ticket_type_id" value={tk.id} />
                <div class="batch-label">
                    <strong>Lote {tk.batches.length + 1}</strong>
                </div>
                <FloatingField label={t('eventEdit.priceCents')}>
                    <input
                        name="price"
                        type="text"
                        inputmode="numeric"
                        placeholder=" "
                        value="0,00"
                    />
                </FloatingField>
                <FloatingField label={t('eventEdit.qty')}>
                    <input name="quantity_total" type="number" placeholder=" " min="1" required />
                </FloatingField>
                <div></div>
                <button class="small" type="submit">{t('eventEdit.addBatch')}</button>
            </form>
        </div>
    {/each}
    <form method="POST" action="?/addTicketType" class="add" use:enhance={submitNewRow}>
        <input type="hidden" name="event_id" value={event.id} />
        <FloatingField label={t('common.name')}>
            <input name="name" placeholder=" " required />
        </FloatingField>
        <button class="small" type="submit">{t('eventEdit.add')}</button>
    </form>
</div>

<style>
    .small {
        font-size: 0.85rem;
    }
    .ticket-type {
        padding: 0.75rem;
        background: var(--surface-2);
        border-radius: var(--radius);
        display: grid;
        gap: 0.5rem;
    }
    .ticket-type > .add:first-child {
        grid-template-columns: 1fr auto;
    }
    .batches-head {
        margin: 0.25rem 0 0;
        font-size: 0.9rem;
        font-weight: 600;
    }
    .batch-row {
        grid-template-columns: auto 1fr 1fr auto auto;
    }
    .batch-label {
        display: flex;
        flex-direction: column;
        min-width: 5rem;
    }
</style>
