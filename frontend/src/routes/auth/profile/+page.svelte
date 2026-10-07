<script lang="ts">
    import { enhance } from '$app/forms';
    import { goto } from '$app/navigation';
    import { t } from '$lib/i18n';
    import {
        profileFieldError,
        profileFailureMessage
    } from '$lib/modules/accounts/profile-messages';
    import type { UserDto } from '$lib/modules/accounts/types';
    import { auth } from '$lib/stores/auth.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // The form starts from what the database holds and then belongs to the user;
    // it must not snap back when the page data is invalidated mid-edit.
    // svelte-ignore state_referenced_locally
    let name = $state(data.user.name ?? '');
    // svelte-ignore state_referenced_locally
    let cellphone = $state(data.user.cellphone ?? '');
    // svelte-ignore state_referenced_locally
    let tax_id = $state(data.user.taxId ?? '');
    let busy = $state(false);

    const fieldError = (field: 'name' | 'cellphone' | 'taxId') =>
        profileFieldError(form?.fieldErrors, field);
</script>

<div class="auth-wrap">
    <div class="card stack">
        <h1>{t('auth.profile.title')}</h1>
        <p class="muted">{t('auth.profile.subtitle')}</p>
        <form
            method="POST"
            action="?/save"
            class="stack"
            use:enhance={() => {
                busy = true;
                return async ({ result, update }) => {
                    busy = false;
                    const saved =
                        result.type === 'success' ? (result.data as { user?: UserDto }) : undefined;
                    if (saved?.user) {
                        auth.setUser(saved.user);
                        await goto(data.next);
                        return;
                    }
                    await update();
                };
            }}
        >
            <label for="name">{t('auth.profile.name')}</label>
            <input
                id="name"
                name="name"
                type="text"
                bind:value={name}
                required
                autocomplete="name"
                placeholder="Maria Silva"
                aria-invalid={fieldError('name') ? 'true' : undefined}
            />
            {#if fieldError('name')}
                <div class="field-error">{fieldError('name')}</div>
            {/if}

            <label for="cellphone">{t('auth.profile.cellphone')}</label>
            <input
                id="cellphone"
                name="cellphone"
                type="tel"
                inputmode="tel"
                bind:value={cellphone}
                required
                autocomplete="tel"
                placeholder="(11) 99999-9999"
                aria-invalid={fieldError('cellphone') ? 'true' : undefined}
            />
            {#if fieldError('cellphone')}
                <div class="field-error">{fieldError('cellphone')}</div>
            {/if}

            <label for="tax_id">{t('auth.profile.taxId')}</label>
            <input
                id="tax_id"
                name="tax_id"
                type="text"
                inputmode="numeric"
                bind:value={tax_id}
                required
                placeholder="000.000.000-00"
                aria-invalid={fieldError('taxId') ? 'true' : undefined}
            />
            {#if fieldError('taxId')}
                <div class="field-error">{fieldError('taxId')}</div>
            {/if}

            {#if form?.error}
                <div class="error">{profileFailureMessage(form.error)}</div>
            {/if}
            <button type="submit" disabled={busy || !name || !cellphone || !tax_id}>
                {busy ? t('auth.profile.saving') : t('auth.profile.save')}
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
    .field-error {
        color: var(--danger);
        font-size: 0.85rem;
        margin-top: -0.25rem;
    }
</style>
