<script lang="ts">
    import { enhance } from '$app/forms';
    import { t } from '$lib/i18n';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let email = $state('');
    let busy = $state(false);

    function failureMessage(code: string | undefined): string | null {
        if (!code) return null;
        if (code === 'already_set_up') return t('setup.errorAlreadySetUp');
        if (code === 'invalid_email') return t('auth.login.invalidEmail');
        return t('setup.errorFallback');
    }

    const error = $derived(failureMessage(form?.error));
</script>

<div class="setup-wrap">
    <div class="card stack">
        <h1>{t('setup.title')}</h1>
        <p class="muted">{t('setup.subtitle', { org: data.organizationName })}</p>
        <form
            method="POST"
            action="?/create"
            class="stack"
            use:enhance={() => {
                busy = true;
                return async ({ update }) => {
                    busy = false;
                    await update({ reset: false });
                };
            }}
        >
            <label for="email">{t('setup.emailLabel')}</label>
            <input
                id="email"
                name="email"
                type="email"
                bind:value={email}
                required
                placeholder="voce@exemplo.com"
                autocomplete="email"
                aria-invalid={form?.error === 'invalid_email' ? 'true' : undefined}
            />
            <p class="muted small">{t('setup.hint')}</p>
            {#if error}
                <div class="error">{error}</div>
            {/if}
            <button type="submit" disabled={busy || !email.trim()}>
                {busy ? t('setup.submitting') : t('setup.submit')}
            </button>
        </form>
    </div>
</div>

<style>
    .setup-wrap {
        max-width: 420px;
        margin: 3rem auto;
    }
    .small {
        font-size: 0.85rem;
    }
    input[aria-invalid='true'] {
        border-color: var(--danger, #b91c1c);
    }
</style>
