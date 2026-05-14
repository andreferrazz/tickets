<script lang="ts">
	import type { Snippet } from 'svelte';

	let { label, children }: { label: string; children: Snippet } = $props();
</script>

<label class="float">
	{@render children()}
	<span class="label">{label}</span>
</label>

<style>
	.float {
		position: relative;
		display: block;
	}
	.float :global(input) {
		width: 100%;
		box-sizing: border-box;
	}
	.label {
		position: absolute;
		left: 0.65rem;
		top: 50%;
		transform: translateY(-50%);
		padding: 0 0.25rem;
		color: var(--muted, #888);
		background: transparent;
		pointer-events: none;
		transition: top 120ms ease, font-size 120ms ease, color 120ms ease, background 120ms ease;
		font-size: 1rem;
	}
	.float:has(:global(input:not(:placeholder-shown))) .label,
	.float:has(:global(input:focus)) .label {
		top: 0;
		font-size: 0.75rem;
		background: var(--surface, #fff);
		color: var(--muted, #666);
	}
</style>
