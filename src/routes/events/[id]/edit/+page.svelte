<script lang="ts">
    import { enhance } from '$app/forms';
    import EventForm from '$lib/components/EventForm.svelte';
    import { t } from '$lib/i18n';
    import type { TranslationKey } from '$lib/i18n/pt';
    import type { ActionData, PageData } from './$types';
    import ExtraSectionsEditor from './ExtraSectionsEditor.svelte';
    import { confirmThenSubmit, submitRow } from './row-forms';
    import TicketTypesCard from './TicketTypesCard.svelte';

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
</script>

{#if !event}
    <div class="error">{t('eventEdit.errorFallback')}</div>
{:else}
    <!-- The rows inside both editors share one grid, defined below. -->
    <div class="event-edit">
        <h1>{t('eventEdit.title')}</h1>
        <div class="card" style="margin: 1rem 0;">
            <EventForm
                initial={event}
                submitLabel={t('eventEdit.saveEvent')}
                action="?/updateEvent"
                error={eventFormError}
            />
        </div>

        <TicketTypesCard {event} />
        <ExtraSectionsEditor {event} />

        {#if actionError && form?.action !== 'updateEvent'}
            <div class="error" style="margin: 1rem 0;">{actionError}</div>
        {/if}

        <form
            method="POST"
            action="?/deleteEvent"
            use:enhance={submitRow}
            style="margin-top: 1.5rem;"
        >
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
    </div>
{/if}

<style>
    /* Global under this page only: the row forms live in the two child
       components, and both lay their rows out on this grid. `:where` keeps the
       rule weaker than a child's own columns (`.batch-row`), as it was when all
       of this was one file; the narrow-screen rule is left stronger on purpose,
       so it still collapses those rows to one column. */
    :where(.event-edit) :global(.add) {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr auto;
        gap: 0.5rem;
        align-items: center;
    }
    @media (max-width: 600px) {
        .event-edit :global(.add) {
            grid-template-columns: 1fr;
        }
    }
</style>
