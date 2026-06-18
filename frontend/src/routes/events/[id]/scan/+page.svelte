<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api, ApiError } from '$lib/api';
	import QrScanner from '$lib/components/QrScanner.svelte';
	import { formatDateTime } from '$lib/datetime';
	import { t } from '$lib/i18n';
	import { auth } from '$lib/stores/auth.svelte';
	import type { EventDetail, ValidateResult } from '$lib/types';
	import { onMount } from 'svelte';

	let event = $state<EventDetail | null>(null);
	let loading = $state(true);
	let allowed = $state(false);
	let error = $state<string | null>(null);

	// Banner shown after each scan; its presence pauses the camera until dismissed.
	type ScanOutcome = { tone: 'ok' | 'warn' | 'error'; title: string; detail?: string };
	let outcome = $state<ScanOutcome | null>(null);
	let validating = $state(false);

	onMount(async () => {
		if (!auth.isAuthed) {
			await goto(`/auth/login?next=/events/${page.params.id}/scan`);
			return;
		}
		try {
			await auth.loadMemberships();
			event = await api.getEvent(page.params.id!);
			allowed = auth.canManageOrg(event.organization_id);
		} catch (e) {
			error = e instanceof ApiError ? e.message : t('scan.errorFallback');
		} finally {
			loading = false;
		}
	});

	async function handleToken(token: string) {
		if (validating || outcome) return;
		validating = true;
		try {
			const res = await api.validatePass(page.params.id!, token);
			outcome =
				res.status === 'checked_in'
					? { tone: 'ok', title: t('scan.checkedIn'), detail: passDetail(res) }
					: { tone: 'warn', title: t('scan.alreadyCheckedIn'), detail: alreadyDetail(res) };
			buzz(res.status === 'checked_in' ? [90] : [40, 60, 40]);
		} catch (e) {
			outcome = errorOutcome(e);
			buzz([120, 80, 120]);
		} finally {
			validating = false;
		}
	}

	function passDetail(res: ValidateResult): string {
		const p = res.pass;
		return p.seat_label ? `${p.item_name} · ${p.seat_label}` : p.item_name;
	}

	function alreadyDetail(res: ValidateResult): string {
		if (!res.pass.checked_in_at) return passDetail(res);
		return t('scan.alreadyAt', { time: formatDateTime(res.pass.checked_in_at) });
	}

	function errorOutcome(e: unknown): ScanOutcome {
		if (e instanceof ApiError) {
			if (e.status === 422) return { tone: 'error', title: t('scan.wrongEvent') };
			if (e.status === 403) return { tone: 'error', title: t('scan.forbidden') };
			if (e.status === 404) return { tone: 'error', title: t('scan.invalid') };
		}
		return { tone: 'error', title: t('scan.errorFallback') };
	}

	function buzz(pattern: number[]) {
		if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
	}

	function onCameraError(kind: 'no-camera' | 'permission') {
		error = kind === 'no-camera' ? t('scan.noCamera') : t('scan.cameraDenied');
	}
</script>

{#if loading}
	<p class="muted">{t('common.loading')}</p>
{:else if error}
	<div class="error">{error}</div>
{:else if !allowed}
	<div class="error">{t('scan.notAuthorized')}</div>
{:else}
	<header class="head">
		<h1>{t('scan.title')}</h1>
		<a href="/events/{page.params.id}/dashboard" class="btn secondary small">←</a>
	</header>
	{#if event}<p class="muted">{event.title}</p>{/if}

	<div class="scan-wrap">
		<QrScanner onScan={handleToken} paused={!!outcome} {onCameraError} />
	</div>

	{#if outcome}
		<div class="result {outcome.tone}" role="status">
			<strong>{outcome.title}</strong>
			{#if outcome.detail}<div class="detail">{outcome.detail}</div>{/if}
			<button type="button" class="btn" onclick={() => (outcome = null)}>
				{t('scan.scanNext')}
			</button>
		</div>
	{:else if validating}
		<p class="muted center">{t('scan.validating')}</p>
	{:else}
		<p class="muted center">{t('scan.hint')}</p>
	{/if}
{/if}

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin: 1rem 0 0.5rem;
	}
	.scan-wrap {
		margin: 1rem 0;
	}
	.center {
		text-align: center;
	}
	.result {
		max-width: 460px;
		margin: 0 auto;
		padding: 1rem;
		border-radius: var(--radius);
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: center;
		color: #fff;
	}
	.result strong {
		font-size: 1.25rem;
	}
	.result .detail {
		font-size: 0.95rem;
		opacity: 0.95;
	}
	.result.ok {
		background: #15803d;
	}
	.result.warn {
		background: #b45309;
	}
	.result.error {
		background: #b91c1c;
	}
	.result .btn {
		background: rgba(255, 255, 255, 0.18);
		border: 1px solid rgba(255, 255, 255, 0.4);
		color: #fff;
	}
</style>
