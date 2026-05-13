<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api, ApiError } from '$lib/api';
	import { t } from '$lib/i18n';
	import { auth } from '$lib/stores/auth.svelte';
	import { onMount } from 'svelte';

	let error = $state<string | null>(null);

	onMount(async () => {
		const token = page.params.token!;
		try {
			const res = await api.acceptInvitation(token);
			auth.set(res.token, res.user);
			await goto('/');
		} catch (e) {
			error = mapError(e);
		}
	});

	function mapError(e: unknown): string {
		if (!(e instanceof ApiError)) return t('invite.errorFallback');
		switch (e.message) {
			case 'expired':
				return t('invite.errorExpired');
			case 'invalid_token':
				return t('invite.errorInvalid');
			case 'already_accepted':
				return t('invite.errorAlreadyAccepted');
			default:
				return t('invite.errorFallback');
		}
	}
</script>

<div class="invite-wrap">
	<div class="card stack">
		{#if error}
			<h1>{t('invite.errorTitle')}</h1>
			<p class="error">{error}</p>
			<a href="/auth/login">{t('invite.goLogin')}</a>
		{:else}
			<p>{t('invite.accepting')}</p>
		{/if}
	</div>
</div>

<style>
	.invite-wrap {
		max-width: 420px;
		margin: 3rem auto;
	}
</style>
