import { browser } from '$app/environment';
import type { OrganizationMembership, User } from '$lib/types';

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
	memberships = $state<OrganizationMembership[] | null>(null);

	#inflight: Promise<OrganizationMembership[]> | null = null;

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
		this.memberships = null;
		this.#inflight = null;
		if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
	}

	setUser(user: User): void {
		this.user = user;
		if (browser && this.token) {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: this.token, user }));
		}
	}

	clear(): void {
		this.token = null;
		this.user = null;
		this.memberships = null;
		this.#inflight = null;
		if (browser) localStorage.removeItem(STORAGE_KEY);
	}

	/**
	 * Lazily fetches the user's org memberships once per session, deduping
	 * concurrent callers. Pass `force: true` after an event that should
	 * invalidate the cache (e.g. accepting another invitation).
	 */
	async loadMemberships(force = false): Promise<OrganizationMembership[]> {
		if (!this.token) return [];
		if (!force && this.memberships) return this.memberships;
		if (!force && this.#inflight) return this.#inflight;

		// Import lazily to avoid the api ↔ auth cycle at module-load time.
		const { api } = await import('$lib/api');
		this.#inflight = api
			.myOrganizations()
			.then((rows) => {
				this.memberships = rows;
				return rows;
			})
			.finally(() => {
				this.#inflight = null;
			});

		return this.#inflight;
	}

	/** True when the user is a member of `orgId` or has the admin role. */
	canManageOrg(orgId: string | null | undefined): boolean {
		if (!orgId) return false;
		if (this.user?.role === 'admin') return true;
		return !!this.memberships?.some((m) => m.id === orgId);
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
