<script lang="ts">
    import { enhance } from '$app/forms';
    import { t } from '$lib/i18n';
    import {
        profileFieldError,
        profileFailureMessage
    } from '$lib/modules/accounts/profile-messages';
    import type {
        ProfileField,
        ProfileFieldErrors
    } from '$lib/modules/accounts/profile-validation';
    import type { UserDto } from '$lib/modules/accounts/types';
    import { auth } from '$lib/stores/auth.svelte';
    import { loginModalStore } from '$lib/stores/loginModal.svelte';
    import type { LoginActionResult } from './failure-text';

    type SavePayload =
        { user?: UserDto; fieldErrors?: ProfileFieldErrors; error?: string } | undefined;

    // The step is mounted fresh each time the modal reaches it, so the inputs
    // start from whatever the verify step just stored on `auth.user`.
    let name = $state(auth.user?.name ?? '');
    let cellphone = $state(auth.user?.cellphone ?? '');
    let tax_id = $state(auth.user?.taxId ?? '');

    let error = $state<string | null>(null);
    let fieldErrors = $state<ProfileFieldErrors | null>(null);
    let busy = $state(false);

    const fieldError = (field: ProfileField) => profileFieldError(fieldErrors ?? undefined, field);

    const onProfile = () => {
        busy = true;
        error = null;
        fieldErrors = null;
        return async ({ result }: { result: LoginActionResult }) => {
            busy = false;
            const payload = result.data as SavePayload;
            if (result.type === 'success' && payload?.user) {
                auth.setUser(payload.user);
                loginModalStore.finish();
                return;
            }
            if (payload?.fieldErrors) fieldErrors = payload.fieldErrors;
            else error = profileFailureMessage(payload?.error ?? '');
        };
    };
</script>

<h2 id="login-modal-title">{t('auth.profile.title')}</h2>
<p class="muted">{t('auth.profile.subtitle')}</p>
<form method="POST" action="/auth/profile?/save" class="stack" use:enhance={onProfile}>
    <label for="lm-name">{t('auth.profile.name')}</label>
    <input
        id="lm-name"
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

    <label for="lm-cellphone">{t('auth.profile.cellphone')}</label>
    <input
        id="lm-cellphone"
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

    <label for="lm-tax-id">{t('auth.profile.taxId')}</label>
    <input
        id="lm-tax-id"
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

    {#if error}
        <div class="error">{error}</div>
    {/if}
    <button type="submit" disabled={busy || !name || !cellphone || !tax_id}>
        {busy ? t('auth.profile.saving') : t('auth.profile.save')}
    </button>
</form>
