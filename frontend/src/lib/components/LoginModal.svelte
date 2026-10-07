<script lang="ts">
    import { loginModalStore } from '$lib/stores/loginModal.svelte';
    import CodeStep from './login/CodeStep.svelte';
    import EmailStep from './login/EmailStep.svelte';
    import ProfileStep from './login/ProfileStep.svelte';

    // Each step is its own component with its own state, mounted fresh when
    // `loginModalStore.step` changes; the shell only owns the dialog chrome.
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
</script>

<svelte:window onkeydown={onKeydown} />

{#if loginModalStore.open}
    <div class="backdrop" onclick={onBackdropClick} role="presentation">
        <div
            class="dialog card stack"
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-modal-title"
        >
            {#if loginModalStore.step === 'email'}
                <EmailStep />
            {:else if loginModalStore.step === 'code'}
                <CodeStep />
            {:else}
                <ProfileStep />
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
    /* The step markup lives in the login/ child components, so these rules
       must reach past this component's scope to style it. */
    .dialog :global {
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
    }
</style>
