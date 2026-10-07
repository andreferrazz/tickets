<script lang="ts">
    import { enhance } from '$app/forms';
    import { afterNavigate } from '$app/navigation';
    import { resolve } from '$app/paths';
    import QrScanner from '$lib/components/QrScanner.svelte';
    import { t } from '$lib/i18n';
    import type { CheckInDto, ExtraLineRow } from '$lib/modules/passes/types';
    import { formatDateTime } from '$lib/utils/datetime';
    import type { PageProps, SubmitFunction } from './$types';

    // Server-rendered: whoever reaches this component may scan for the event;
    // the load function answers 404 for everyone else.
    let { data, params }: PageProps = $props();

    // Back target: the route the user came from. Falls back to the event page on
    // a direct load (refresh / deep link), since staff can't reach the dashboard.
    // svelte-ignore state_referenced_locally
    let backHref = $state(resolve('/events/[id]', { id: params.id }));
    afterNavigate(({ from }) => {
        if (from?.url?.pathname) backHref = from.url.pathname + from.url.search;
    });

    // Banner shown after each scan; its presence pauses the camera until dismissed.
    type ScanOutcome = {
        tone: 'ok' | 'warn' | 'error';
        title: string;
        detail?: string;
        items?: string[];
    };
    let outcome = $state<ScanOutcome | null>(null);
    let validating = $state(false);
    let cameraNotice = $state<string | null>(null);
    let token = $state('');
    let scanForm = $state<HTMLFormElement | null>(null);

    // The camera and the typed code share one form: a decoded QR fills the
    // field and submits it, so there is a single path to the server.
    async function handleToken(decoded: string) {
        if (validating || outcome) return;
        token = decoded;
        await Promise.resolve();
        scanForm?.requestSubmit();
    }

    const submitScan: SubmitFunction = () => {
        validating = true;
        return async ({ result }) => {
            validating = false;
            token = '';
            const scan = result.type === 'success' ? result.data?.scan : undefined;
            if (!scan) {
                outcome = { tone: 'error', title: failureTitle(result) };
                return buzz([120, 80, 120]);
            }
            outcome = scanOutcome(scan);
            buzz(scan.status === 'checked_in' ? [90] : [40, 60, 40]);
        };
    };

    // Extra passes bundle every add-on in the order behind the generic name
    // "Extras"; list the actual items so staff know what to hand over. For
    // them the list replaces the redundant detail line.
    function scanOutcome(scan: CheckInDto): ScanOutcome {
        const items =
            scan.kind === 'extra'
                ? scan.extras.map((line: ExtraLineRow) => `${line.quantity}× ${line.name}`)
                : undefined;
        if (scan.status === 'checked_in') {
            return {
                tone: 'ok',
                title: items ? t('scan.extrasTitle') : t('scan.checkedIn'),
                detail: items ? undefined : scan.itemName,
                items
            };
        }
        return {
            tone: 'warn',
            title: items ? t('scan.alreadyCheckedInExtra') : t('scan.alreadyCheckedIn'),
            detail: scan.checkedInAt
                ? t('scan.alreadyAt', { time: formatDateTime(scan.checkedInAt) })
                : scan.itemName,
            items
        };
    }

    function failureTitle(result: { type: string; data?: Record<string, unknown> }): string {
        const code = result.type === 'failure' ? result.data?.error : null;
        if (code === 'wrong_event') return t('scan.wrongEvent');
        if (code === 'forbidden') return t('scan.forbidden');
        if (code === 'not_found') return t('scan.invalid');
        return t('scan.errorFallback');
    }

    function buzz(pattern: number[]) {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
    }

    // No camera is no longer the end of the page: the code can be pasted.
    function onCameraError(kind: 'no-camera' | 'permission') {
        cameraNotice = kind === 'no-camera' ? t('scan.noCamera') : t('scan.cameraDenied');
    }
</script>

<header class="head">
    <h1>{t('scan.title')}</h1>
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- already a resolved path, or the page the visitor came from -->
    <a href={backHref} class="btn secondary small">←</a>
</header>
<p class="muted">{data.eventTitle}</p>

{#if cameraNotice}
    <div class="notice">{cameraNotice}</div>
{:else}
    <div class="scan-wrap">
        <QrScanner onScan={handleToken} paused={!!outcome} {onCameraError} />
    </div>
{/if}

{#if outcome}
    <div class="result {outcome.tone}" role="status">
        <strong>{outcome.title}</strong>
        {#if outcome.detail}<div class="detail">{outcome.detail}</div>{/if}
        {#if outcome.items}
            <div class="detail">{t('scan.extrasList')}</div>
            <ul class="extras">
                {#each outcome.items as item, i (`${i}:${item}`)}<li>{item}</li>{/each}
            </ul>
        {/if}
        <button type="button" class="btn" onclick={() => (outcome = null)}>
            {t('scan.scanNext')}
        </button>
    </div>
{:else if validating}
    <p class="muted center">{t('scan.validating')}</p>
{:else}
    <p class="muted center">{t('scan.hint')}</p>
{/if}

<form
    method="POST"
    action="?/checkin"
    class="card stack manual"
    bind:this={scanForm}
    use:enhance={submitScan}
>
    <label for="token">{t('scan.manualLabel')}</label>
    <input id="token" name="token" bind:value={token} autocomplete="off" required />
    <p class="muted small">{t('scan.manualHint')}</p>
    <button type="submit" class="secondary" disabled={validating || !!outcome || !token}>
        {t('scan.manualSubmit')}
    </button>
</form>

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
    .result .extras {
        list-style: none;
        margin: 0;
        padding: 0;
        font-size: 1.1rem;
        font-weight: 600;
    }
    .result .extras li {
        padding: 0.15rem 0;
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
    .manual {
        margin-top: 1.5rem;
    }
</style>
