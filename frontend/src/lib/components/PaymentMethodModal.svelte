<script lang="ts">
	import { t } from '$lib/i18n';
	import type { PaymentMethod } from '$lib/types';

	type Props = {
		open: boolean;
		onSelect: (method: PaymentMethod) => void;
		onClose: () => void;
	};

	let { open, onSelect, onClose }: Props = $props();

	const methods: { value: PaymentMethod; label: string }[] = [
		{ value: 'PIX', label: t('payment.pix') },
		// { value: 'CARD', label: t('payment.card') },
		{ value: 'BOLETO', label: t('payment.boleto') },
	];

	function onKeydown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') onClose();
	}

	function onBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose();
	}
</script>

<svelte:window on:keydown={onKeydown} />

{#if open}
	<div class="backdrop" onclick={onBackdropClick} role="presentation">
		<div class="dialog card" role="dialog" aria-modal="true" aria-labelledby="payment-title">
			<div class="dialog-head">
				<h3 id="payment-title">{t('payment.choose')}</h3>
				<button type="button" class="secondary small" onclick={onClose}>
					{t('common.cancel')}
				</button>
			</div>
			<div class="methods">
				{#each methods as m (m.value)}
					<button type="button" class="method" onclick={() => onSelect(m.value)}>
						<span class="method-label">{m.label}</span>
					</button>
				{/each}
			</div>
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
		max-width: 420px;
		width: 100%;
		background: var(--surface);
	}
	.dialog-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		gap: 1rem;
	}
	.dialog-head h3 {
		margin: 0;
	}
	.methods {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.method {
		display: flex;
		align-items: center;
		padding: 0.85rem 1rem;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		background: var(--surface-2);
		color: var(--text);
		cursor: pointer;
		text-align: left;
	}
	.method:hover:not(:disabled) {
		background: var(--border);
		border-color: var(--accent);
	}
	.method-label {
		font-weight: 600;
	}
</style>
