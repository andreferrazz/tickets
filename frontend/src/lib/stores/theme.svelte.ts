import { browser } from '$app/environment';

const STORAGE_KEY = 'tickets.theme';

type ThemeName = 'light' | 'dark';

function load(): ThemeName {
	if (!browser) return 'light';
	try {
		return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
	} catch {
		return 'light';
	}
}

class ThemeStore {
	current = $state<ThemeName>('light');

	constructor() {
		this.current = load();
		this.apply();
	}

	set(next: ThemeName): void {
		this.current = next;
		if (browser) {
			try {
				if (next === 'light') localStorage.removeItem(STORAGE_KEY);
				else localStorage.setItem(STORAGE_KEY, next);
			} catch {
				/* private mode — in-memory only */
			}
		}
		this.apply();
	}

	toggle(): void {
		this.set(this.current === 'dark' ? 'light' : 'dark');
	}

	private apply(): void {
		if (!browser) return;
		if (this.current === 'dark') {
			document.documentElement.dataset.theme = 'dark';
		} else {
			delete document.documentElement.dataset.theme;
		}
	}
}

export const theme = new ThemeStore();
