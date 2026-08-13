<script lang="ts">
	import { goto } from '$app/navigation';
	import { api, ApiError, type FieldErrors } from '$lib/api';
	import { t } from '$lib/i18n';
	import { auth } from '$lib/stores/auth.svelte';
	import { safeNext } from '$lib/utils/next';
	import { onMount } from 'svelte';

	let name = $state(auth.user?.name ?? '');
	let cellphone = $state(auth.user?.cellphone ?? '');
	let tax_id = $state(auth.user?.tax_id ?? '');
	let error = $state<string | null>(null);
	let fieldErrors = $state<FieldErrors | null>(null);
	let busy = $state(false);

	function handleApiError(e: unknown) {
		if (e instanceof ApiError) {
			if (e.fieldErrors) {
				fieldErrors = e.fieldErrors;
				error = null;
				return;
			}
			if (e.message === 'abacate_unavailable') {
				error = t('auth.profile.errorUnavailable');
				return;
			}
			if (e.message === 'invalid_profile_data') {
				error = t('auth.profile.errorInvalidData');
				return;
			}
		}
		error = t('auth.profile.errorFallback');
	}

	function fieldError(field: 'name' | 'cellphone' | 'tax_id'): string | null {
		const messages = fieldErrors?.[field];
		if (!messages?.length) return null;
		return translateFieldError(field, messages[0]);
	}

	function translateFieldError(field: string, message: string): string {
		if (message === "can't be blank") return t('auth.profile.fieldRequired');
		if (message.includes('at least')) return t('auth.profile.fieldTooShort');
		if (field === 'tax_id') return t('auth.profile.fieldInvalidTaxId');
		if (field === 'cellphone') return t('auth.profile.fieldInvalidCellphone');
		return message;
	}

	onMount(() => {
		if (!auth.isAuthed) {
			goto('/auth/login');
			return;
		}
		if (auth.user?.profile_complete) {
			const next = safeNext(sessionStorage.getItem('tickets.pending_next'));
			sessionStorage.removeItem('tickets.pending_next');
			goto(next ?? '/');
		}
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = null;
		fieldErrors = null;
		busy = true;
		try {
			const user = await api.updateProfile({ name, cellphone, tax_id });
			auth.setUser(user);
			const next = safeNext(sessionStorage.getItem('tickets.pending_next'));
			sessionStorage.removeItem('tickets.pending_next');
			await goto(next ?? '/');
		} catch (e) {
			handleApiError(e);
		} finally {
			busy = false;
		}
	}
</script>

<div class="auth-wrap">
	<div class="card stack">
		<h1>{t('auth.profile.title')}</h1>
		<p class="muted">{t('auth.profile.subtitle')}</p>
		<form onsubmit={submit} class="stack">
			<label for="name">{t('auth.profile.name')}</label>
			<input
				id="name"
				type="text"
				bind:value={name}
				required
				autocomplete="name"
				placeholder="Maria Silva"
				aria-invalid={fieldError('name') ? 'true' : undefined}
			/>
			{#if fieldError('name')}
				<div class="field-error">{fieldError('name')}</div>
			{/if}

			<label for="cellphone">{t('auth.profile.cellphone')}</label>
			<input
				id="cellphone"
				type="tel"
				inputmode="tel"
				bind:value={cellphone}
				required
				autocomplete="tel"
				placeholder="(11) 99999-9999"
				aria-invalid={fieldError('cellphone') ? 'true' : undefined}
			/>
			{#if fieldError('cellphone')}
				<div class="field-error">{fieldError('cellphone')}</div>
			{/if}

			<label for="tax_id">{t('auth.profile.taxId')}</label>
			<input
				id="tax_id"
				type="text"
				inputmode="numeric"
				bind:value={tax_id}
				required
				placeholder="000.000.000-00"
				aria-invalid={fieldError('tax_id') ? 'true' : undefined}
			/>
			{#if fieldError('tax_id')}
				<div class="field-error">{fieldError('tax_id')}</div>
			{/if}

			{#if error}
				<div class="error">{error}</div>
			{/if}
			<button type="submit" disabled={busy || !name || !cellphone || !tax_id}>
				{busy ? t('auth.profile.saving') : t('auth.profile.save')}
			</button>
		</form>
	</div>
</div>

<style>
	.auth-wrap {
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
