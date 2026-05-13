import { browser } from '$app/environment';
import type { User } from '$lib/types';

const STORAGE_KEY = 'tickets.auth';

interface Persisted {
	token: string;
	user: User;
}

function load(): Persisted | null {
	if (!browser) return null;
	const raw = localStorage.getItem(STORAGE_KEY);
	if (!raw) return null;
	try {
		return JSON.parse(raw) as Persisted;
	} catch {
		return null;
	}
}

class AuthStore {
	token = $state<string | null>(null);
	user = $state<User | null>(null);

	constructor() {
		const p = load();
		if (p) {
			this.token = p.token;
			this.user = p.user;
		}
	}

	set(token: string, user: User): void {
		this.token = token;
		this.user = user;
		if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
	}

	clear(): void {
		this.token = null;
		this.user = null;
		if (browser) localStorage.removeItem(STORAGE_KEY);
	}

	get isAuthed(): boolean {
		return !!this.token;
	}

	get isCreator(): boolean {
		return this.user?.role === 'creator' || this.user?.role === 'admin';
	}

	get isAdmin(): boolean {
		return this.user?.role === 'admin';
	}
}

export const auth = new AuthStore();
