<script lang="ts">
    import { enhance } from '$app/forms';
    import { page } from '$app/state';
    import { t } from '$lib/i18n';
    import { safeNext } from '$lib/utils/next';
    import type { ActionData } from './$types';

    let { form }: { form: ActionData } = $props();

    let email = $state('');
    let busy = $state(false);
    const next = $derived(safeNext(page.url.searchParams.get('next')) ?? '');
</script>

<div class="auth-wrap">
    <div class="card stack">
        <h1>{t('auth.login.title')}</h1>
        <p class="muted">{t('auth.login.subtitle')}</p>
        <form
            method="POST"
            action="?/request"
            class="stack"
            use:enhance={() => {
                busy = true;
                return async ({ update }) => {
                    busy = false;
                    await update();
                };
            }}
        >
            <input type="hidden" name="next" value={next} />
            <label for="email">{t('common.email')}</label>
            <input
                id="email"
                name="email"
                type="email"
                bind:value={email}
                required
                placeholder="voce@exemplo.com"
                autocomplete="email"
            />
            {#if form?.error}
                <div class="error">{form.error}</div>
            {/if}
            <button type="submit" disabled={busy || !email}>
                {busy ? t('auth.login.sending') : t('auth.login.sendCode')}
            </button>
        </form>
    </div>
</div>

<style>
    .auth-wrap {
        display: flex;
        justify-content: center;
        padding: 2rem 0;
    }
    .card {
        width: 100%;
        max-width: 420px;
    }
</style>
