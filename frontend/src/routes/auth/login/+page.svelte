<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api, ApiError } from '$lib/api';
	import { t } from '$lib/i18n';
	import { safeNext } from '$lib/utils/next';

	let email = $state('');
	let hint = $state<string | null>(null);
	let error = $state<string | null>(null);
	let busy = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = null;
		hint = null;
		busy = true;
		try {
			await api.requestCode(email);
			hint = 'Código enviado! Verifique seu e-mail.';
			sessionStorage.setItem('tickets.pending_email', email);
			const next = safeNext(page.url.searchParams.get('next'));
			if (next) sessionStorage.setItem('tickets.pending_next', next);
			else sessionStorage.removeItem('tickets.pending_next');
			await goto('/auth/verify');
		} catch (e) {
			error = e instanceof ApiError ? e.message : t('auth.login.errorFallback');
		} finally {
			busy = false;
		}
	}
</script>

<div class="auth-wrap">
	<div class="card stack">
		<h1>{t('auth.login.title')}</h1>
		<p class="muted">{t('auth.login.subtitle')}</p>
		<form onsubmit={submit} class="stack">
			<label for="email">{t('common.email')}</label>
			<input
				id="email"
				type="email"
				bind:value={email}
				required
				placeholder="voce@exemplo.com"
				autocomplete="email"
			/>
			{#if error}
				<div class="error">{error}</div>
			{/if}
			{#if hint}
				<div class="notice">{hint}</div>
			{/if}
			<button type="submit" disabled={busy || !email}>
				{busy ? t('auth.login.sending') : t('auth.login.sendCode')}
			</button>
		</form>
	</div>
</div>

<style>
	.auth-wrap {
		max-width: 420px;
		margin: 3rem auto;
	}
</style>
