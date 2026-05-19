<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api, ApiError, type FieldErrors } from '$lib/api';
	import { t } from '$lib/i18n';
	import { auth } from '$lib/stores/auth.svelte';
	import { onMount } from 'svelte';

	const ONBOARDING_KEY = 'tickets.onboarding_org';

	interface PendingOrg {
		id: string;
		name: string;
	}

	function readPending(): PendingOrg | null {
		try {
			const raw = sessionStorage.getItem(ONBOARDING_KEY);
			if (!raw) return null;
			return JSON.parse(raw) as PendingOrg;
		} catch {
			return null;
		}
	}

	let orgId = $state('');
	let name = $state('');
	let error = $state<string | null>(null);
	let fieldErrors = $state<FieldErrors | null>(null);
	let busy = $state(false);

	onMount(() => {
		if (!auth.isAuthed) {
			goto('/auth/login');
			return;
		}
		orgId = page.params.id!;
		const pending = readPending();
		// Pre-fill from the placeholder name only when this is the post-invite
		// flow for the same org. Otherwise leave the field empty so the leader
		// types fresh — they're not coming from an invitation.
		name = pending && pending.id === orgId ? pending.name : '';
	});

	function fieldError(field: 'name'): string | null {
		const messages = fieldErrors?.[field];
		if (!messages?.length) return null;
		if (messages[0] === "can't be blank") return t('onboarding.org.fieldRequired');
		return messages[0];
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = null;
		fieldErrors = null;
		busy = true;
		try {
			await api.updateOrganization(orgId, { name: name.trim() });
			sessionStorage.removeItem(ONBOARDING_KEY);
			await goto('/');
		} catch (e) {
			handleApiError(e);
		} finally {
			busy = false;
		}
	}

	function handleApiError(e: unknown) {
		if (e instanceof ApiError) {
			if (e.fieldErrors) {
				fieldErrors = e.fieldErrors;
				return;
			}
			if (e.status === 403) {
				error = t('onboarding.org.errorForbidden');
				return;
			}
		}
		error = t('onboarding.org.errorFallback');
	}
</script>

<div class="onboarding-wrap">
	<div class="card stack">
		<h1>{t('onboarding.org.title')}</h1>
		<p class="muted">{t('onboarding.org.subtitle')}</p>
		<form onsubmit={submit} class="stack">
			<label for="name">{t('onboarding.org.nameLabel')}</label>
			<input
				id="name"
				type="text"
				bind:value={name}
				required
				autocomplete="organization"
				placeholder={t('onboarding.org.namePlaceholder')}
				aria-invalid={fieldError('name') ? 'true' : undefined}
			/>
			{#if fieldError('name')}
				<div class="field-error">{fieldError('name')}</div>
			{/if}

			{#if error}
				<div class="error">{error}</div>
			{/if}
			<button type="submit" disabled={busy || !name.trim()}>
				{busy ? t('onboarding.org.saving') : t('onboarding.org.save')}
			</button>
		</form>
	</div>
</div>

<style>
	.onboarding-wrap {
		max-width: 420px;
		margin: 3rem auto;
	}
	.field-error {
		color: var(--danger, #b91c1c);
		font-size: 0.85rem;
		margin-top: -0.25rem;
	}
	input[aria-invalid='true'] {
		border-color: var(--danger, #b91c1c);
	}
</style>
