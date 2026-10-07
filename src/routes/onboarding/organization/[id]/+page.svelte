<script lang="ts">
    import { enhance } from '$app/forms';
    import { t } from '$lib/i18n';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // svelte-ignore state_referenced_locally
    let name = $state(data.name);
    let busy = $state(false);

    function failureMessage(code: string | undefined): string | null {
        if (!code) return null;
        if (code === 'validation') return t('onboarding.org.fieldRequired');
        if (code === 'forbidden') return t('onboarding.org.errorForbidden');
        return t('onboarding.org.errorFallback');
    }

    const error = $derived(failureMessage(form?.error));
</script>

<div class="onboarding-wrap">
    <div class="card stack">
        <h1>{t('onboarding.org.title')}</h1>
        <p class="muted">{t('onboarding.org.subtitle')}</p>
        <form
            method="POST"
            action="?/rename"
            class="stack"
            use:enhance={() => {
                busy = true;
                return async ({ update }) => {
                    busy = false;
                    await update({ reset: false });
                };
            }}
        >
            <label for="name">{t('onboarding.org.nameLabel')}</label>
            <input
                id="name"
                name="name"
                type="text"
                bind:value={name}
                required
                autocomplete="organization"
                placeholder={t('onboarding.org.namePlaceholder')}
                aria-invalid={form?.error === 'validation' ? 'true' : undefined}
            />
            {#if error}
                <div class="error">{error}</div>
            {/if}
            <button type="submit" disabled={busy || !name.trim()}>
                {busy ? t('onboarding.org.saving') : t('onboarding.org.save')}
            </button>
        </form>
    </div>
</div>

<style>
    .onboarding-wrap {
        max-width: 420px;
        margin: 3rem auto;
    }
    input[aria-invalid='true'] {
        border-color: var(--danger, #b91c1c);
    }
</style>
