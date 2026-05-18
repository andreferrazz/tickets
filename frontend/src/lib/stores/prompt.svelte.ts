export interface PromptOptions {
	message: string;
	placeholder?: string;
	initialValue?: string;
	confirmText?: string;
	cancelText?: string;
}

type Resolver = (value: string | null) => void;

class PromptStore {
	open = $state(false);
	message = $state('');
	placeholder = $state<string | undefined>(undefined);
	value = $state('');
	confirmText = $state<string | undefined>(undefined);
	cancelText = $state<string | undefined>(undefined);

	private resolver: Resolver | null = null;

	request(opts: PromptOptions): Promise<string | null> {
		if (this.resolver) this.resolver(null);
		this.message = opts.message;
		this.placeholder = opts.placeholder;
		this.value = opts.initialValue ?? '';
		this.confirmText = opts.confirmText;
		this.cancelText = opts.cancelText;
		this.open = true;
		return new Promise<string | null>((resolve) => {
			this.resolver = resolve;
		});
	}

	resolve(value: string | null): void {
		const r = this.resolver;
		this.resolver = null;
		this.open = false;
		if (r) r(value);
	}
}

export const promptStore = new PromptStore();

export function prompt(opts: PromptOptions): Promise<string | null> {
	return promptStore.request(opts);
}
