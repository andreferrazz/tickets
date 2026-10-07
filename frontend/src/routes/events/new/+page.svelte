<script lang="ts">
    import EventForm from '$lib/components/EventForm.svelte';
    import { t } from '$lib/i18n';
    import type { ActionData } from './$types';

    let { form }: { form: ActionData } = $props();

    // An admin reaches this page but belongs to no organization, so the server
    // cannot place the event; the message says so rather than a generic failure.
    const error = $derived(
        form?.error === 'organization_id_required'
            ? t('eventNew.noOrganization')
            : form?.error
              ? t('eventForm.saveFailed')
              : null
    );
</script>

<h1>{t('eventNew.title')}</h1>
<p class="muted">{t('eventNew.subtitle')}</p>
<div class="card" style="margin-top: 1rem;">
    <EventForm submitLabel={t('eventNew.cta')} action="?/create" {error} />
</div>
