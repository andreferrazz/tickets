<script lang="ts">
    import { resolve } from '$app/paths';
    import { goto } from '$app/navigation';
    import { t } from '$lib/i18n';
    import { auth } from '$lib/stores/auth.svelte';
    import { onMount } from 'svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    // The server already turned a live token into the cookie; what is left is
    // the browser's copy for the endpoints Phoenix still serves.
    onMount(async () => {
        if (!data.token || !data.user) return;
        await auth.set(data.token, data.user);
        await goto(resolve('/'));
    });
</script>

<div class="impersonate-wrap">
    <div class="card stack">
        {#if !data.user}
            <h1>{t('impersonate.errorTitle')}</h1>
            <p class="error">{t('impersonate.errorFallback')}</p>
            <a href={resolve('/auth/login')}>{t('impersonate.goLogin')}</a>
        {:else}
            <p>{t('impersonate.loading')}</p>
        {/if}
    </div>
</div>

<style>
    .impersonate-wrap {
        display: flex;
        justify-content: center;
        padding: 2rem 0;
    }
    .card {
        width: 100%;
        max-width: 420px;
    }
</style>
