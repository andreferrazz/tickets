<script lang="ts">
    import EventForm from '$lib/components/EventForm.svelte';
    import { t } from '$lib/i18n';
    import type { ActionData } from './$types';

    let { form }: { form: ActionData } = $props();

    const error = $derived(form?.error ? t('eventForm.saveFailed') : null);
</script>

<h1>{t('eventNew.title')}</h1>
<p class="muted">{t('eventNew.subtitle')}</p>
<div class="card" style="margin-top: 1rem;">
    <EventForm submitLabel={t('eventNew.cta')} action="?/create" {error} />
</div>
