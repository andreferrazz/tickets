<script lang="ts">
	import { goto } from '$app/navigation';
	import { api, ApiError } from '$lib/api';
	import { t } from '$lib/i18n';
	import { auth } from '$lib/stores/auth.svelte';
	import { safeNext } from '$lib/next';
	import { onMount } from 'svelte';

	let email = $state('');
	let code = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);

	onMount(() => {
		email = sessionStorage.getItem('tickets.pending_email') ?? '';
		if (!email) goto('/auth/login');
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = null;
		busy = true;
		try {
			const res = await api.verifyCode(email, code);
			auth.set(res.token, res.user);
			sessionStorage.removeItem('tickets.pending_email');
			const next = safeNext(sessionStorage.getItem('tickets.pending_next'));
			sessionStorage.removeItem('tickets.pending_next');
			await goto(next ?? '/');
		} catch (e) {
			error = e instanceof ApiError ? e.message : t('auth.verify.errorFallback');
		} finally {
			busy = false;
		}
	}
</script>

<div class="auth-wrap">
	<div class="card stack">
		<h1>{t('auth.verify.title')}</h1>
		<p class="muted">{t('auth.verify.sentTo')} <strong>{email}</strong></p>
		<form onsubmit={submit} class="stack">
			<label for="code">{t('auth.verify.label')}</label>
			<input
				id="code"
				type="text"
				inputmode="numeric"
				maxlength="6"
				bind:value={code}
				required
				placeholder="123456"
				autocomplete="one-time-code"
			/>
			{#if error}
				<div class="error">{error}</div>
			{/if}
			<button type="submit" disabled={busy || code.length !== 6}>
				{busy ? t('auth.verify.verifying') : t('auth.verify.verify')}
			</button>
			<a href="/auth/login" class="muted">{t('auth.verify.changeEmail')}</a>
		</form>
	</div>
</div>

<style>
	.auth-wrap {
		max-width: 420px;
		margin: 3rem auto;
	}
</style>
