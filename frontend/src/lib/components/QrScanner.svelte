<script lang="ts">
	// Thin wrapper around the `qr-scanner` (Nimiq) library so the rest of the app
	// never touches it directly (CLAUDE.md: wrap third-party libs behind a thin
	// interface). Emits decoded QR text via `onScan` and surfaces camera setup
	// failures via `onCameraError`.
	import QrScanner from 'qr-scanner';
	import { onDestroy, onMount } from 'svelte';

	type CameraError = 'no-camera' | 'permission';

	type Props = {
		onScan: (token: string) => void;
		paused?: boolean;
		onCameraError?: (kind: CameraError) => void;
	};

	let { onScan, paused = false, onCameraError }: Props = $props();

	let video: HTMLVideoElement;
	let scanner = $state<QrScanner | null>(null);

	// Suppress repeats of the same code while a physical QR lingers in frame.
	const REPEAT_WINDOW_MS = 2500;
	let lastToken = '';
	let lastAt = 0;

	function handleDecoded(token: string) {
		const now = Date.now();
		if (token === lastToken && now - lastAt < REPEAT_WINDOW_MS) return;
		lastToken = token;
		lastAt = now;
		onScan(token);
	}

	onMount(async () => {
		if (!(await QrScanner.hasCamera())) {
			onCameraError?.('no-camera');
			return;
		}
		scanner = new QrScanner(video, (result) => handleDecoded(result.data), {
			highlightScanRegion: true,
			highlightCodeOutline: true,
			preferredCamera: 'environment'
		});
	});

	// Drive start/pause reactively: pause the stream while a result banner is up,
	// resume when the operator dismisses it. Runs once `scanner` is created.
	$effect(() => {
		const s = scanner;
		if (!s) return;
		if (paused) {
			s.pause();
		} else {
			s.start().catch(() => onCameraError?.('permission'));
		}
	});

	onDestroy(() => {
		scanner?.stop();
		scanner?.destroy();
		scanner = null;
	});
</script>

<video bind:this={video} class="scanner-video" aria-label="QR scanner">
	<track kind="captions" />
</video>

<style>
	.scanner-video {
		width: 100%;
		max-width: 460px;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: var(--radius);
		background: #000;
		display: block;
		margin: 0 auto;
	}
</style>
