<script lang="ts">
    import { enhance } from '$app/forms';
    import { t } from '$lib/i18n';
    import {
        profileFieldError,
        profileFailureMessage
    } from '$lib/modules/accounts/profile-messages';
    import type { ProfileFieldErrors } from '$lib/modules/accounts/profile-validation';
    import type { UserDto } from '$lib/modules/accounts/types';
    import { auth } from '$lib/stores/auth.svelte';
    import { loginModalStore } from '$lib/stores/loginModal.svelte';

    // The three steps post to the pages' own actions (/auth/login, /auth/verify,
    // /auth/profile) and intercept the results to stay in the modal, so there is
    // one login flow on the server and this is only another front for it.
    let email = $state('');
    let code = $state('');
    let name = $state('');
    let cellphone = $state('');
    let tax_id = $state('');

    let error = $state<string | null>(null);
    let fieldErrors = $state<ProfileFieldErrors | null>(null);
    let busy = $state(false);

    $effect(() => {
        if (loginModalStore.open && loginModalStore.step === 'email') {
            email = '';
            code = '';
            error = null;
            fieldErrors = null;
        }
        if (loginModalStore.open && loginModalStore.step === 'profile') {
            name = auth.user?.name ?? '';
            cellphone = auth.user?.cellphone ?? '';
            tax_id = auth.user?.taxId ?? '';
            error = null;
            fieldErrors = null;
        }
    });

    const fieldError = (field: 'name' | 'cellphone' | 'taxId') =>
        profileFieldError(fieldErrors ?? undefined, field);

    function close() {
        loginModalStore.resolve(false);
    }

    function onKeydown(e: KeyboardEvent) {
        if (!loginModalStore.open) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            close();
        }
    }

    function onBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) close();
    }

    function failureText(data: Record<string, unknown> | undefined, fallback: string): string {
        return typeof data?.error === 'string' ? data.error : fallback;
    }

    const onRequest = () => {
        busy = true;
        error = null;
        return async ({ result }: { result: { type: string; data?: Record<string, unknown> } }) => {
            busy = false;
            // The page action redirects to the verify page; here that means "code sent".
            if (result.type === 'redirect') {
                loginModalStore.toCode(email);
                code = '';
                return;
            }
            error = failureText(result.data, t('auth.login.errorFallback'));
        };
    };

    const onVerify = () => {
        busy = true;
        error = null;
        return async ({ result }: { result: { type: string; data?: Record<string, unknown> } }) => {
            busy = false;
            const data = result.data as { token?: string; user?: UserDto } | undefined;
            if (result.type === 'success' && data?.token && data.user) {
                await auth.set(data.token, data.user);
                if (data.user.profileComplete) loginModalStore.finish();
                else loginModalStore.toProfile();
                return;
            }
            error = failureText(result.data, t('auth.verify.errorFallback'));
        };
    };

    const onProfile = () => {
        busy = true;
        error = null;
        fieldErrors = null;
        return async ({ result }: { result: { type: string; data?: Record<string, unknown> } }) => {
            busy = false;
            const data = result.data as
                { user?: UserDto; fieldErrors?: ProfileFieldErrors; error?: string } | undefined;
            if (result.type === 'success' && data?.user) {
                auth.setUser(data.user);
                loginModalStore.finish();
                return;
            }
            if (data?.fieldErrors) fieldErrors = data.fieldErrors;
            else error = profileFailureMessage(data?.error ?? '');
        };
    };

    function backToEmail() {
        loginModalStore.step = 'email';
        error = null;
    }
</script>

<svelte:window on:keydown={onKeydown} />

{#if loginModalStore.open}
    <div class="backdrop" onclick={onBackdropClick} role="presentation">
        <div
            class="dialog card stack"
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-modal-title"
        >
            {#if loginModalStore.step === 'email'}
                <h2 id="login-modal-title">{t('auth.login.title')}</h2>
                <p class="muted">{t('auth.login.subtitle')}</p>
                <form
                    method="POST"
                    action="/auth/login?/request"
                    class="stack"
                    use:enhance={onRequest}
                >
                    <label for="lm-email">{t('common.email')}</label>
                    <input
                        id="lm-email"
                        name="email"
                        type="email"
                        bind:value={email}
                        required
                        placeholder="voce@exemplo.com"
                        autocomplete="email"
                    />
                    {#if error}
                        <div class="error">{error}</div>
                    {/if}
                    <button type="submit" disabled={busy || !email}>
                        {busy ? t('auth.login.sending') : t('auth.login.sendCode')}
                    </button>
                </form>
            {:else if loginModalStore.step === 'code'}
                <h2 id="login-modal-title">{t('auth.verify.title')}</h2>
                <p class="muted">
                    {t('auth.verify.sentTo')} <strong>{loginModalStore.email}</strong>
                </p>
                <form
                    method="POST"
                    action="/auth/verify?/verify"
                    class="stack"
                    use:enhance={onVerify}
                >
                    <input type="hidden" name="email" value={loginModalStore.email} />
                    <label for="lm-code">{t('auth.verify.label')}</label>
                    <input
                        id="lm-code"
                        name="code"
                        type="text"
                        inputmode="numeric"
                        maxlength="6"
                        bind:value={code}
                        required
                        placeholder="123456"
                        autocomplete="one-time-code"
                    />
                    {#if error}
                        <div class="error">{error}</div>
                    {/if}
                    <button type="submit" disabled={busy || code.length !== 6}>
                        {busy ? t('auth.verify.verifying') : t('auth.verify.verify')}
                    </button>
                    <button type="button" class="link" onclick={backToEmail}>
                        {t('auth.verify.changeEmail')}
                    </button>
                </form>
            {:else}
                <h2 id="login-modal-title">{t('auth.profile.title')}</h2>
                <p class="muted">{t('auth.profile.subtitle')}</p>
                <form
                    method="POST"
                    action="/auth/profile?/save"
                    class="stack"
                    use:enhance={onProfile}
                >
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
            {/if}
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
    }
    h2 {
        margin: 0;
    }
    .field-error {
        color: var(--danger, #b91c1c);
        font-size: 0.85rem;
        margin-top: -0.25rem;
    }
    input[aria-invalid='true'] {
        border-color: var(--danger, #b91c1c);
    }
    .link {
        background: none;
        border: none;
        color: var(--muted, #6b7280);
        text-decoration: underline;
        cursor: pointer;
        padding: 0;
        font: inherit;
    }
</style>
