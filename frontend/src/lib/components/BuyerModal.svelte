<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { t } from '$lib/i18n';
	import type { ExtraBuyer } from '$lib/types';

	export type BuyerKind = 'extra' | 'ticket';
	export type BuyerTarget = { kind: BuyerKind; id: string; name: string };

	type Props = {
		target: BuyerTarget | null;
		onClose: () => void;
	};

	let { target, onClose }: Props = $props();

	let buyers = $state<ExtraBuyer[] | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	let lastTargetId: string | null = null;

	$effect(() => {
		if (target && target.id !== lastTargetId) {
			lastTargetId = target.id;
			loadBuyers(target);
		} else if (!target) {
			lastTargetId = null;
		}
	});

	async function loadBuyers(t0: BuyerTarget) {
		buyers = null;
		error = null;
		loading = true;
		try {
			buyers =
				t0.kind === 'ticket'
					? await api.listTicketTypeBuyers(t0.id)
					: await api.listExtraBuyers(t0.id);
		} catch (e) {
			error = e instanceof ApiError ? e.message : t('dashboard.errorFallback');
		} finally {
			loading = false;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (target && e.key === 'Escape') onClose();
	}

	function onBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose();
	}
</script>

<svelte:window on:keydown={onKeydown} />

{#if target}
	<div class="backdrop" onclick={onBackdropClick} role="presentation">
		<div class="dialog card" role="dialog" aria-modal="true" aria-labelledby="buyers-title">
			<div class="dialog-head">
				<h3 id="buyers-title">
					{t(target.kind === 'ticket' ? 'dashboard.ticketBuyers' : 'dashboard.extraBuyers', {
						name: target.name,
					})}
				</h3>
				<button type="button" class="secondary small" onclick={onClose}>
					{t('dashboard.close')}
				</button>
			</div>
			{#if loading}
				<p class="muted">{t('common.loading')}</p>
			{:else if error}
				<div class="error">{error}</div>
			{:else if !buyers || buyers.length === 0}
				<p class="muted">{t('dashboard.noBuyers')}</p>
			{:else}
				<div class="table-wrap">
					<table>
						<thead>
							<tr>
								<th>{t('dashboard.buyerName')}</th>
								<th>{t('dashboard.buyerTaxId')}</th>
								<th class="num-col">{t('dashboard.buyerQty')}</th>
							</tr>
						</thead>
						<tbody>
							{#each buyers as b (b.email)}
								<tr>
									<td>{b.name ?? b.email}</td>
									<td>{b.tax_id ?? '—'}</td>
									<td class="num-col">{b.quantity}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="total-row">
					<span>{t('common.total')}</span>
					<span class="num-col">
						{buyers.reduce((sum, b) => sum + b.quantity, 0)}
					</span>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		z-index: 100;
	}
	.dialog {
		max-width: 640px;
		width: 100%;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		background: var(--surface);
	}
	.dialog-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
		gap: 1rem;
	}
	.dialog-head h3 {
		margin: 0;
	}
	.table-wrap {
		overflow: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th,
	td {
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--border);
		text-align: left;
	}
	th {
		font-size: 0.85rem;
		color: var(--muted);
		font-weight: 600;
	}
	.total-row {
		display: flex;
		justify-content: space-between;
		padding: 0.75rem;
		border-top: 2px solid var(--border);
		font-weight: 600;
	}
	.num-col {
		text-align: right;
	}
</style>
