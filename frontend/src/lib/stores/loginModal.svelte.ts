export type LoginStep = 'email' | 'code' | 'profile';

type Resolver = (value: boolean) => void;

class LoginModalStore {
	open = $state(false);
	step = $state<LoginStep>('email');
	email = $state('');

	private resolver: Resolver | null = null;

	request(): Promise<boolean> {
		if (this.resolver) this.resolver(false);
		this.step = 'email';
		this.email = '';
		this.open = true;
		return new Promise<boolean>((resolve) => {
			this.resolver = resolve;
		});
	}

	toCode(email: string): void {
		this.email = email;
		this.step = 'code';
	}

	toProfile(): void {
		this.step = 'profile';
	}

	finish(): void {
		this.resolve(true);
	}

	resolve(value: boolean): void {
		const r = this.resolver;
		this.resolver = null;
		this.open = false;
		this.step = 'email';
		this.email = '';
		if (r) r(value);
	}
}

export const loginModalStore = new LoginModalStore();

export function requestLogin(): Promise<boolean> {
	return loginModalStore.request();
}
