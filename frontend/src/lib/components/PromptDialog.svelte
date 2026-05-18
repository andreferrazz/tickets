<script lang="ts">
	import { promptStore } from '$lib/stores/prompt.svelte';
	import { t } from '$lib/i18n';
	import { tick } from 'svelte';

	let inputEl = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (promptStore.open) {
			tick().then(() => {
				inputEl?.focus();
				inputEl?.select();
			});
		}
	});

	function submit() {
		const trimmed = promptStore.value.trim();
		if (!trimmed) return;
		promptStore.resolve(trimmed);
	}

	function onKeydown(e: KeyboardEvent) {
		if (!promptStore.open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			promptStore.resolve(null);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			submit();
		}
	}

	function onBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) promptStore.resolve(null);
	}
</script>

<svelte:window on:keydown={onKeydown} />

{#if promptStore.open}
	<div class="backdrop" onclick={onBackdropClick} role="presentation">
		<div class="dialog card" role="dialog" aria-modal="true" aria-labelledby="prompt-message">
			<p id="prompt-message" class="message">{promptStore.message}</p>
			<input
				bind:this={inputEl}
				bind:value={promptStore.value}
				placeholder={promptStore.placeholder ?? ''}
			/>
			<div class="actions">
				<button type="button" class="secondary" onclick={() => promptStore.resolve(null)}>
					{promptStore.cancelText ?? t('common.cancel')}
				</button>
				<button type="button" disabled={!promptStore.value.trim()} onclick={submit}>
					{promptStore.confirmText ?? t('common.confirm')}
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
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.message {
		margin: 0;
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
