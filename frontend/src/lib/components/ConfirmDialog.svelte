<script lang="ts">
	import { confirmStore } from '$lib/stores/confirm.svelte';
	import { t } from '$lib/i18n';
	import { tick } from 'svelte';

	let confirmBtn = $state<HTMLButtonElement | null>(null);

	$effect(() => {
		if (confirmStore.open) {
			tick().then(() => confirmBtn?.focus());
		}
	});

	function onKeydown(e: KeyboardEvent) {
		if (!confirmStore.open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			confirmStore.resolve(false);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			confirmStore.resolve(true);
		}
	}

	function onBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) confirmStore.resolve(false);
	}
</script>

<svelte:window on:keydown={onKeydown} />

{#if confirmStore.open}
	<div class="backdrop" onclick={onBackdropClick} role="presentation">
		<div
			class="dialog card"
			role="dialog"
			aria-modal="true"
			aria-labelledby="confirm-message"
		>
			<p id="confirm-message" class="message">{confirmStore.message}</p>
			<div class="actions">
				<button
					type="button"
					class="secondary"
					onclick={() => confirmStore.resolve(false)}
				>
					{confirmStore.cancelText ?? t('common.cancel')}
				</button>
				<button
					type="button"
					bind:this={confirmBtn}
					class:danger={confirmStore.danger}
					onclick={() => confirmStore.resolve(true)}
				>
					{confirmStore.confirmText ?? t('common.confirm')}
				</button>
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
	.message {
		margin: 0 0 1rem;
		color: var(--text);
		font-size: 1rem;
		line-height: 1.4;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}
</style>
