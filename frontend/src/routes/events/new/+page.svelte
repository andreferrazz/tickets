<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';
	import EventForm from '$lib/components/EventForm.svelte';
	import { t } from '$lib/i18n';
	import { auth } from '$lib/stores/auth.svelte';
	import type { Event } from '$lib/types';
	import { onMount } from 'svelte';

	onMount(() => {
		if (!auth.isAuthed) goto('/auth/login');
		else if (!auth.isCreator) goto('/');
	});

	async function save(data: Partial<Event>) {
		const ev = await api.createEvent(data);
		await goto(`/events/${ev.id}/edit`);
	}
</script>

<h1>{t('eventNew.title')}</h1>
<p class="muted">{t('eventNew.subtitle')}</p>
<div class="card" style="margin-top: 1rem;">
	<EventForm submitLabel={t('eventNew.cta')} onSubmit={save} />
</div>
