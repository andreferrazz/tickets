<script lang="ts">
	import { goto } from '$app/navigation';
	import { api, ApiError } from '$lib/api';
	import { formatDateTime } from '$lib/utils/datetime';
	import { t, tStatus } from '$lib/i18n';
	import { auth } from '$lib/stores/auth.svelte';
	import type { Invitation } from '$lib/types';
	import { onMount } from 'svelte';

	let invitations = $state<Invitation[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let email = $state('');
	let sendError = $state<string | null>(null);
	let busy = $state(false);

	async function reload() {
		invitations = await api.listInvitations();
	}

	onMount(async () => {
		if (!auth.isAuthed) {
			await goto('/auth/login');
			return;
		}
		if (!auth.isAdmin) {
			await goto('/');
			return;
		}
		try {
			await reload();
		} catch (e) {
			error = e instanceof ApiError ? e.message : t('invitations.errorFallback');
		} finally {
			loading = false;
		}
	});

	async function send(e: SubmitEvent) {
		e.preventDefault();
		sendError = null;
		busy = true;
		try {
			await api.createInvitation(email);
			email = '';
			await reload();
		} catch (e) {
			sendError = e instanceof ApiError ? e.message : t('invitations.sendErrorFallback');
		} finally {
			busy = false;
		}
	}
</script>

<h1>{t('invitations.title')}</h1>
<p class="muted">{t('invitations.subtitle')}</p>

<form onsubmit={send} class="card stack" style="margin: 1rem 0;">
	<label for="email">{t('common.email')}</label>
	<div class="row">
		<input
			id="email"
			type="email"
			bind:value={email}
			placeholder="amigo@exemplo.com"
			required
		/>
		<button type="submit" disabled={busy || !email}>
			{busy ? t('invitations.sending') : t('invitations.send')}
		</button>
	</div>
	{#if sendError}
		<div class="error">{sendError}</div>
	{/if}
</form>

{#if loading}
	<p class="muted">{t('common.loading')}</p>
{:else if error}
	<div class="error">{error}</div>
{:else if invitations.length === 0}
	<p class="muted">{t('invitations.empty')}</p>
{:else}
	<div class="stack">
		{#each invitations as i (i.id)}
			<div class="line card">
				<div>
					<strong>{i.email}</strong>
					<div class="muted small">{formatDateTime(i.created_at)}</div>
				</div>
				<span class="badge {i.status === 'accepted' ? 'paid' : 'pending'}"
					>{tStatus(i.status)}</span
				>
			</div>
		{/each}
	</div>
{/if}

<style>
	.line {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.small {
		font-size: 0.85rem;
	}
	.row :global(input) {
		flex: 1;
	}
</style>
