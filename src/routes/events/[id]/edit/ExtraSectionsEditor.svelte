<script lang="ts">
    import { enhance } from '$app/forms';
    import FloatingField from '$lib/components/FloatingField.svelte';
    import { t } from '$lib/i18n';
    import { prompt as promptDialog } from '$lib/stores/prompt.svelte';
    import { formatCentsInput } from '$lib/utils/currency';
    import type { PageData } from './$types';
    import { confirmThenSubmit, saveOnChange, submitNewRow, submitRow } from './row-forms';

    // The add-ons of an event: sections that can be renamed, reordered by
    // dragging and deleted, each holding its extras as rows.
    let { event }: { event: NonNullable<PageData['event']> } = $props();

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
                    <input name="title" placeholder=" " value={s.title} onchange={saveOnChange} />
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
                <input name="price" type="text" inputmode="numeric" placeholder=" " value="0,00" />
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
<button class="secondary" type="button" onclick={addSection}>{t('eventEdit.addSection')}</button>

<style>
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
</style>
