export interface ConfirmOptions {
	message: string;
	confirmText?: string;
	cancelText?: string;
	danger?: boolean;
}

type Resolver = (value: boolean) => void;

class ConfirmStore {
	open = $state(false);
	message = $state('');
	confirmText = $state<string | undefined>(undefined);
	cancelText = $state<string | undefined>(undefined);
	danger = $state(false);

	private resolver: Resolver | null = null;

	request(opts: ConfirmOptions): Promise<boolean> {
		if (this.resolver) this.resolver(false);
		this.message = opts.message;
		this.confirmText = opts.confirmText;
		this.cancelText = opts.cancelText;
		this.danger = !!opts.danger;
		this.open = true;
		return new Promise<boolean>((resolve) => {
			this.resolver = resolve;
		});
	}

	resolve(value: boolean): void {
		const r = this.resolver;
		this.resolver = null;
		this.open = false;
		if (r) r(value);
	}
}

export const confirmStore = new ConfirmStore();

export function confirm(opts: ConfirmOptions): Promise<boolean> {
	return confirmStore.request(opts);
}
