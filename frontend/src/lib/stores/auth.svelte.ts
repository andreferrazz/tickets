import { browser } from '$app/environment';
import type { OrganizationMembership, User } from '$lib/types';

const STORAGE_KEY = 'tickets.auth';
const SESSION_ENDPOINT = '/api/session';

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

/**
 * Copies the token into an httpOnly cookie so server-rendered routes know who is
 * asking. localStorage stays the source of truth for the `Authorization: Bearer`
 * header, which every Phoenix-served endpoint still needs.
 */
async function storeSessionCookie(token: string): Promise<void> {
	await fetch(SESSION_ENDPOINT, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ token })
	});
}

async function dropSessionCookie(): Promise<void> {
	await fetch(SESSION_ENDPOINT, { method: 'DELETE' });
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

	/**
	 * Await this before navigating: the server reads the session cookie while
	 * rendering, so a navigation that races the cookie write renders as anonymous.
	 */
	async set(token: string, user: User): Promise<void> {
		this.token = token;
		this.user = user;
		this.memberships = null;
		this.#inflight = null;
		if (!browser) return;
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
		await storeSessionCookie(token);
	}

	setUser(user: User): void {
		this.user = user;
		if (browser && this.token) {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: this.token, user }));
		}
	}

	/**
	 * Re-issues the session cookie from the token held in localStorage. Covers
	 * sessions that predate the cookie and cookies that expired before the token
	 * did; without it those visitors would be server-rendered as anonymous.
	 */
	async restoreSessionCookie(): Promise<void> {
		if (!browser || !this.token) return;
		await storeSessionCookie(this.token);
	}

	/** Await this before navigating, for the same reason as {@link AuthStore.set}. */
	async clear(): Promise<void> {
		this.token = null;
		this.user = null;
		this.memberships = null;
		this.#inflight = null;
		if (!browser) return;
		localStorage.removeItem(STORAGE_KEY);
		await dropSessionCookie();
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

	/**
	 * True when the user may manage `orgId`: an admin, or a `leader`/`participant`
	 * member. `staff` members are scan-only and excluded here.
	 */
	canManageOrg(orgId: string | null | undefined): boolean {
		if (!orgId) return false;
		if (this.user?.role === 'admin') return true;
		return !!this.memberships?.some(
			(m) => m.id === orgId && (m.role === 'leader' || m.role === 'participant')
		);
	}

	/** True when the user may scan `orgId`'s tickets: an admin or any member (incl. staff). */
	canScan(orgId: string | null | undefined): boolean {
		if (!orgId) return false;
		if (this.user?.role === 'admin') return true;
		return !!this.memberships?.some((m) => m.id === orgId);
	}

	/** True when the user holds a scan-only `staff` membership in any org. */
	get hasStaffMembership(): boolean {
		return !!this.memberships?.some((m) => m.role === 'staff');
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
