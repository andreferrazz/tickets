<script lang="ts">
    import { enhance } from '$app/forms';
    import EventForm from '$lib/components/EventForm.svelte';
    import FloatingField from '$lib/components/FloatingField.svelte';
    import { t } from '$lib/i18n';
    import type { TranslationKey } from '$lib/i18n/pt';
    import { confirm as confirmDialog } from '$lib/stores/confirm.svelte';
    import { prompt as promptDialog } from '$lib/stores/prompt.svelte';
    import { formatCentsInput } from '$lib/utils/currency';
    import type { ActionData, PageData, SubmitFunction } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Server-rendered: an event this visitor may not manage never reaches this
    // component; the load function answers 404 instead.
    const event = $derived(data.event);

    // What each action says when it fails for a reason other than the two
    // business rules below, as the old page reported them.
    const FALLBACKS: Record<string, TranslationKey> = {
        updateEvent: 'eventForm.saveFailed',
        deleteEvent: 'eventEdit.deleteEventError',
        addTicketType: 'eventEdit.saveTicketError',
        updateTicketType: 'eventEdit.saveTicketError',
        deleteTicketType: 'eventEdit.deleteTicketError',
        addBatch: 'eventEdit.saveBatchError',
        updateBatch: 'eventEdit.saveBatchError',
        closeBatch: 'eventEdit.closeBatchError',
        deleteBatch: 'eventEdit.deleteBatchError',
        addExtra: 'eventEdit.saveSectionError',
        updateExtra: 'eventEdit.saveExtraError',
        deleteExtra: 'eventEdit.deleteExtraError',
        addSection: 'eventEdit.saveSectionError',
        updateSection: 'eventEdit.saveSectionError',
        deleteSection: 'eventEdit.deleteSectionError',
        reorderSections: 'eventEdit.saveSectionError'
    };

    function failureMessage(
        failed: { action?: string; error?: string } | null | undefined
    ): string | null {
        if (!failed?.error) return null;
        if (failed.error === 'batch_has_sales') return t('eventEdit.batchHasSales');
        if (failed.error === 'section_not_empty') return t('eventEdit.sectionNotEmpty');
        return t(FALLBACKS[failed.action ?? ''] ?? 'eventEdit.errorFallback');
    }

    const actionError = $derived(failureMessage(form));
    const eventFormError = $derived(form?.action === 'updateEvent' ? actionError : null);

    // Every row is its own form. Saving on change keeps the old feel of the page:
    // the input submits the row it sits in, and the page re-reads itself.
    const submitRow: SubmitFunction = () => {
        return async ({ update }) => {
            await update({ reset: false });
        };
    };
    const submitNewRow: SubmitFunction = () => {
        return async ({ update }) => {
            await update();
        };
    };

    function saveOnChange(e: Event) {
        (e.currentTarget as HTMLInputElement | HTMLTextAreaElement).form?.requestSubmit();
    }

    // The button is a submit button so `requestSubmit(button)` uses its own
    // `formaction`; the click itself is cancelled until the dialog agrees.
    async function confirmThenSubmit(e: MouseEvent, message: string, confirmText: string) {
        e.preventDefault();
        const button = e.currentTarget as HTMLButtonElement;
        const ok = await confirmDialog({ message, confirmText, danger: true });
        if (ok) button.form?.requestSubmit(button);
    }

    let newSectionTitle = $state('');
    let newSectionForm = $state<HTMLFormElement | null>(null);

    async function addSection() {
        const title = await promptDialog({
            message: t('eventEdit.newSectionPrompt'),
            placeholder: t('eventEdit.newSectionPlaceholder'),
            confirmText: t('eventEdit.create')
        });
        if (!title) return;
        newSectionTitle = title;
        await Promise.resolve();
        newSectionForm?.requestSubmit();
    }

    // Drag-and-drop reorder state. `armedHandleId` lets HTML5 DnD start only when
    // the user presses the grip on a section card (inputs/buttons stay clickable).
    let armedHandleId = $state<string | null>(null);
    let draggingSectionId = $state<string | null>(null);
    let dragOverSectionId = $state<string | null>(null);
    let sectionOrder = $state('');
    let reorderForm = $state<HTMLFormElement | null>(null);

    function onSectionDragStart(e: DragEvent, sectionId: string) {
        if (armedHandleId !== sectionId) {
            e.preventDefault();
            return;
        }
        draggingSectionId = sectionId;
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', sectionId);
        }
    }

    function onSectionDragOver(e: DragEvent, sectionId: string) {
        if (!draggingSectionId || draggingSectionId === sectionId) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        dragOverSectionId = sectionId;
    }

    function onSectionDragLeave(sectionId: string) {
        if (dragOverSectionId === sectionId) dragOverSectionId = null;
    }

    function onSectionDrop(e: DragEvent, targetId: string) {
        e.preventDefault();
        const fromId = draggingSectionId;
        draggingSectionId = null;
        dragOverSectionId = null;
        armedHandleId = null;
        if (fromId && fromId !== targetId) reorderSections(fromId, targetId);
    }

    function onSectionDragEnd() {
        draggingSectionId = null;
        dragOverSectionId = null;
        armedHandleId = null;
    }

    // One request carries the whole new order; the server renumbers positions.
    async function reorderSections(fromId: string, targetId: string) {
        if (!event) return;
        const ids = event.extraSections.map((s) => s.id);
        const fromIdx = ids.indexOf(fromId);
        const toIdx = ids.indexOf(targetId);
        if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
        const [moved] = ids.splice(fromIdx, 1);
        ids.splice(toIdx, 0, moved);
        sectionOrder = ids.join(',');
        await Promise.resolve();
        reorderForm?.requestSubmit();
    }
</script>

{#if !event}
    <div class="error">{t('eventEdit.errorFallback')}</div>
{:else}
    <h1>{t('eventEdit.title')}</h1>
    <div class="card" style="margin: 1rem 0;">
        <EventForm
            initial={event}
            submitLabel={t('eventEdit.saveEvent')}
            action="?/updateEvent"
            error={eventFormError}
        />
    </div>

    <div class="card stack" style="margin: 1rem 0;">
        <h2>{t('eventEdit.ticketTypes')}</h2>
        {#each event.ticketTypes as tk (tk.id)}
            <div class="ticket-type">
                <form method="POST" action="?/updateTicketType" class="add" use:enhance={submitRow}>
                    <input type="hidden" name="id" value={tk.id} />
                    <FloatingField label={t('common.name')}>
                        <input
                            name="name"
                            placeholder=" "
                            value={tk.name}
                            onchange={saveOnChange}
                        />
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
                        <input
                            name="quantity_total"
                            type="number"
                            placeholder=" "
                            min="1"
                            required
                        />
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

    <h2 style="margin: 1.5rem 0 0.5rem;">{t('eventEdit.addons')}</h2>

    {#each event.extraSections as s (s.id)}
        <div
            class="card stack section-card"
            class:dragging={draggingSectionId === s.id}
            class:drag-over={dragOverSectionId === s.id && draggingSectionId !== s.id}
            style="margin: 1rem 0;"
            role="group"
            draggable={armedHandleId === s.id}
            ondragstart={(e) => onSectionDragStart(e, s.id)}
            ondragover={(e) => onSectionDragOver(e, s.id)}
            ondragleave={() => onSectionDragLeave(s.id)}
            ondrop={(e) => onSectionDrop(e, s.id)}
            ondragend={onSectionDragEnd}
        >
            <form method="POST" action="?/updateSection" class="stack" use:enhance={submitRow}>
                <input type="hidden" name="id" value={s.id} />
                <div class="section-head">
                    <button
                        type="button"
                        class="drag-handle"
                        aria-label={t('eventEdit.reorderSection')}
                        title={t('eventEdit.reorderSection')}
                        onpointerdown={() => (armedHandleId = s.id)}
                        onpointerup={() => (armedHandleId = null)}
                        onpointerleave={() => {
                            if (!draggingSectionId) armedHandleId = null;
                        }}>⠿</button
                    >
                    <FloatingField label={t('eventEdit.sectionTitle')}>
                        <input
                            name="title"
                            placeholder=" "
                            value={s.title}
                            onchange={saveOnChange}
                        />
                    </FloatingField>
                    <button
                        type="submit"
                        class="danger small"
                        formaction="?/deleteSection"
                        onclick={(e) =>
                            confirmThenSubmit(
                                e,
                                t('eventEdit.confirmDeleteSection', { title: s.title }),
                                t('common.delete')
                            )}>{t('eventEdit.deleteSection')}</button
                    >
                </div>
                <FloatingField label={t('eventEdit.sectionDescription')}>
                    <textarea
                        name="description"
                        placeholder=" "
                        rows="2"
                        value={s.description ?? ''}
                        onchange={saveOnChange}></textarea>
                </FloatingField>
            </form>

            {#each s.extras as x (x.id)}
                <form method="POST" action="?/updateExtra" class="add" use:enhance={submitRow}>
                    <input type="hidden" name="id" value={x.id} />
                    <input type="hidden" name="section_id" value={x.sectionId} />
                    <input type="hidden" name="description" value={x.description ?? ''} />
                    <FloatingField label={t('common.name')}>
                        <input name="name" placeholder=" " value={x.name} onchange={saveOnChange} />
                    </FloatingField>
                    <FloatingField label={t('eventEdit.priceCents')}>
                        <input
                            name="price"
                            type="text"
                            inputmode="numeric"
                            placeholder=" "
                            value={formatCentsInput(x.priceCents)}
                            onchange={saveOnChange}
                        />
                    </FloatingField>
                    <FloatingField label={t('eventEdit.qtyUnlimited')}>
                        <input
                            name="quantity_total"
                            type="number"
                            placeholder=" "
                            value={x.quantityTotal ?? ''}
                            onchange={saveOnChange}
                        />
                    </FloatingField>
                    <label class="check">
                        <input
                            name="show_remaining"
                            type="checkbox"
                            checked={x.showRemaining}
                            onchange={saveOnChange}
                        />
                        {t('eventEdit.showRemaining')}
                    </label>
                    <label class="check">
                        <input
                            name="limit_to_ticket_count"
                            type="checkbox"
                            checked={x.limitToTicketCount}
                            onchange={saveOnChange}
                        />
                        {t('eventEdit.limitToTicketCount')}
                    </label>
                    <button
                        type="submit"
                        class="danger small"
                        formaction="?/deleteExtra"
                        onclick={(e) =>
                            confirmThenSubmit(
                                e,
                                t('eventEdit.confirmDeleteExtra', { name: x.name }),
                                t('common.delete')
                            )}>{t('common.delete')}</button
                    >
                </form>
            {/each}
            <form method="POST" action="?/addExtra" class="add" use:enhance={submitNewRow}>
                <input type="hidden" name="event_id" value={event.id} />
                <input type="hidden" name="section_id" value={s.id} />
                <FloatingField label={t('common.name')}>
                    <input name="name" placeholder=" " required />
                </FloatingField>
                <FloatingField label={t('eventEdit.priceCents')}>
                    <input
                        name="price"
                        type="text"
                        inputmode="numeric"
                        placeholder=" "
                        value="0,00"
                    />
                </FloatingField>
                <FloatingField label={t('eventEdit.qtyUnlimited')}>
                    <input name="quantity_total" type="number" placeholder=" " />
                </FloatingField>
                <button class="small" type="submit">{t('eventEdit.add')}</button>
            </form>
        </div>
    {/each}

    <form
        method="POST"
        action="?/addSection"
        bind:this={newSectionForm}
        use:enhance={submitNewRow}
        hidden
    >
        <input type="hidden" name="event_id" value={event.id} />
        <input type="hidden" name="title" value={newSectionTitle} />
    </form>
    <form
        method="POST"
        action="?/reorderSections"
        bind:this={reorderForm}
        use:enhance={submitRow}
        hidden
    >
        <input type="hidden" name="event_id" value={event.id} />
        <input type="hidden" name="order" value={sectionOrder} />
    </form>
    <button class="secondary" type="button" onclick={addSection}>{t('eventEdit.addSection')}</button
    >

    {#if actionError && form?.action !== 'updateEvent'}
        <div class="error" style="margin: 1rem 0;">{actionError}</div>
    {/if}

    <form method="POST" action="?/deleteEvent" use:enhance={submitRow} style="margin-top: 1.5rem;">
        <button
            type="submit"
            class="danger"
            onclick={(e) =>
                confirmThenSubmit(
                    e,
                    t('eventEdit.confirmDeleteEvent', { title: event.title }),
                    t('common.delete')
                )}>{t('eventEdit.deleteEvent')}</button
        >
    </form>
{/if}

<style>
    .small {
        font-size: 0.85rem;
    }
    .add {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr auto;
        gap: 0.5rem;
        align-items: center;
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
    .section-head {
        display: flex;
        gap: 0.5rem;
        align-items: flex-start;
    }
    .section-head :global(label.float) {
        flex: 1;
    }
    .section-card {
        transition: outline-color 120ms ease;
    }
    .section-card.dragging {
        opacity: 0.55;
    }
    .section-card.drag-over {
        outline: 2px dashed var(--accent, #4a8cff);
        outline-offset: 2px;
    }
    .drag-handle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        padding: 0;
        background: transparent;
        border: none;
        color: var(--text-muted, #888);
        font-size: 1.1rem;
        line-height: 1;
        cursor: grab;
        touch-action: none;
        user-select: none;
    }
    .drag-handle:active {
        cursor: grabbing;
    }
    @media (max-width: 600px) {
        .add {
            grid-template-columns: 1fr;
        }
    }
</style>
