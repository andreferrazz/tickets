<script lang="ts">
	import { api, ApiError, type FieldErrors } from '$lib/api';
	import { t } from '$lib/i18n';
	import { auth } from '$lib/stores/auth.svelte';
	import { loginModalStore } from '$lib/stores/loginModal.svelte';

	let email = $state('');
	let code = $state('');
	let name = $state('');
	let cellphone = $state('');
	let tax_id = $state('');

	let error = $state<string | null>(null);
	let fieldErrors = $state<FieldErrors | null>(null);
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
			tax_id = auth.user?.tax_id ?? '';
			error = null;
			fieldErrors = null;
		}
	});

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

	async function submitEmail(e: SubmitEvent) {
		e.preventDefault();
		error = null;
		busy = true;
		try {
			await api.requestCode(email);
			loginModalStore.toCode(email);
			code = '';
		} catch (e) {
			error = e instanceof ApiError ? e.message : t('auth.login.errorFallback');
		} finally {
			busy = false;
		}
	}

	async function submitCode(e: SubmitEvent) {
		e.preventDefault();
		error = null;
		busy = true;
		try {
			const res = await api.verifyCode(loginModalStore.email, code);
			await auth.set(res.token, res.user);
			if (!res.user.profile_complete) {
				loginModalStore.toProfile();
			} else {
				loginModalStore.finish();
			}
		} catch (e) {
			error = e instanceof ApiError ? e.message : t('auth.verify.errorFallback');
		} finally {
			busy = false;
		}
	}

	function fieldError(field: 'name' | 'cellphone' | 'tax_id'): string | null {
		const messages = fieldErrors?.[field];
		if (!messages?.length) return null;
		return translateFieldError(field, messages[0]);
	}

	function translateFieldError(field: string, message: string): string {
		if (message === "can't be blank") return t('auth.profile.fieldRequired');
		if (message.includes('at least')) return t('auth.profile.fieldTooShort');
		if (field === 'tax_id') return t('auth.profile.fieldInvalidTaxId');
		if (field === 'cellphone') return t('auth.profile.fieldInvalidCellphone');
		return message;
	}

	function handleProfileError(e: unknown) {
		if (e instanceof ApiError) {
			if (e.fieldErrors) {
				fieldErrors = e.fieldErrors;
				error = null;
				return;
			}
			if (e.message === 'abacate_unavailable') {
				error = t('auth.profile.errorUnavailable');
				return;
			}
			if (e.message === 'invalid_profile_data') {
				error = t('auth.profile.errorInvalidData');
				return;
			}
		}
		error = t('auth.profile.errorFallback');
	}

	async function submitProfile(e: SubmitEvent) {
		e.preventDefault();
		error = null;
		fieldErrors = null;
		busy = true;
		try {
			const user = await api.updateProfile({ name, cellphone, tax_id });
			auth.setUser(user);
			loginModalStore.finish();
		} catch (e) {
			handleProfileError(e);
		} finally {
			busy = false;
		}
	}

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
				<form onsubmit={submitEmail} class="stack">
					<label for="lm-email">{t('common.email')}</label>
					<input
						id="lm-email"
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
				<form onsubmit={submitCode} class="stack">
					<label for="lm-code">{t('auth.verify.label')}</label>
					<input
						id="lm-code"
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
				<form onsubmit={submitProfile} class="stack">
					<label for="lm-name">{t('auth.profile.name')}</label>
					<input
						id="lm-name"
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
						type="text"
						inputmode="numeric"
						bind:value={tax_id}
						required
						placeholder="000.000.000-00"
						aria-invalid={fieldError('tax_id') ? 'true' : undefined}
					/>
					{#if fieldError('tax_id')}
						<div class="field-error">{fieldError('tax_id')}</div>
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
