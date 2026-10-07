<script lang="ts">
    import { enhance } from '$app/forms';
    import { t } from '$lib/i18n';
    import type { EventDto } from '$lib/modules/events/types';
    import { fromLocalInputValue, toLocalInputValue } from '$lib/utils/datetime';

    // A real form posting to the page action named by `action`; the page
    // decides what happens on success (a redirect for a new event, a re-read
    // for an existing one) and hands any failure back through `error`.
    interface Props {
        initial?: Partial<EventDto>;
        submitLabel: string;
        action: string;
        error?: string | null;
    }

    let { initial = {}, submitLabel, action, error = null }: Props = $props();

    // svelte-ignore state_referenced_locally
    let title = $state(initial.title ?? '');
    // svelte-ignore state_referenced_locally
    let description = $state(initial.description ?? '');
    // svelte-ignore state_referenced_locally
    let tickets_description = $state(initial.ticketsDescription ?? '');
    // svelte-ignore state_referenced_locally
    let location = $state(initial.location ?? '');
    // svelte-ignore state_referenced_locally
    let starts_at = $state(initial.startsAt ? toLocalInputValue(initial.startsAt) : '');
    // svelte-ignore state_referenced_locally
    let cover_image_url = $state(initial.coverImageUrl ?? '');
    // svelte-ignore state_referenced_locally
    let status = $state<'draft' | 'published' | 'closed' | 'cancelled'>(initial.status ?? 'draft');
    let busy = $state(false);
</script>

<form
    method="POST"
    {action}
    class="stack"
    use:enhance={({ formData }) => {
        // The input is local time; the server stores UTC.
        formData.set('starts_at', fromLocalInputValue(String(formData.get('starts_at') ?? '')));
        busy = true;
        return async ({ update }) => {
            busy = false;
            await update({ reset: false });
        };
    }}
>
    {#if initial.id}
        <input type="hidden" name="event_id" value={initial.id} />
    {/if}
    <div>
        <label for="title">{t('eventForm.title')}</label>
        <input id="title" name="title" bind:value={title} required />
    </div>
    <div>
        <label for="desc">{t('eventForm.description')}</label>
        <textarea id="desc" name="description" bind:value={description} rows="4"></textarea>
    </div>
    <div>
        <label for="tickets-desc">{t('eventForm.ticketsDescription')}</label>
        <textarea
            id="tickets-desc"
            name="tickets_description"
            bind:value={tickets_description}
            rows="2"></textarea>
    </div>
    <div>
        <label for="loc">{t('eventForm.location')}</label>
        <input id="loc" name="location" bind:value={location} />
    </div>
    <div>
        <label for="starts">{t('eventForm.startsAt')}</label>
        <input id="starts" name="starts_at" type="datetime-local" bind:value={starts_at} required />
    </div>
    <div>
        <label for="cover">{t('eventForm.coverUrl')}</label>
        <input id="cover" name="cover_image_url" type="url" bind:value={cover_image_url} />
    </div>
    <div>
        <label for="status">{t('eventForm.status')}</label>
        <select id="status" name="status" bind:value={status}>
            <option value="draft">{t('eventForm.draft')}</option>
            <option value="published">{t('eventForm.published')}</option>
            <option value="closed">{t('eventForm.closed')}</option>
            {#if initial.status === 'cancelled'}
                <option value="cancelled">{t('status.cancelled')}</option>
            {/if}
        </select>
    </div>
    {#if error}
        <div class="error">{error}</div>
    {/if}
    <button type="submit" disabled={busy}>
        {busy ? t('common.saving') : submitLabel}
    </button>
</form>

<style>
</style>
