import { browser } from '$app/environment';
import { invalidateAll } from '$app/navigation';
import { fromApiUser } from '$lib/modules/accounts/legacy';
import type { UserDto } from '$lib/modules/accounts/types';
import type { User } from '$lib/types';

const STORAGE_KEY = 'tickets.auth';
const SESSION_ENDPOINT = '/api/session';

interface Persisted {
    token: string;
    user: UserDto;
}

function load(): Persisted | null {
    if (!browser) return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        const persisted = JSON.parse(raw) as { token: string; user: UserDto | User };
        return { token: persisted.token, user: migrateUser(persisted.user) };
    } catch {
        return null;
    }
}

/**
 * Copies the token into an httpOnly cookie so server-rendered routes know who is
 * asking. localStorage keeps its copy only for browsers signed in before the
 * cutover, which have no cookie yet (see `SESSION_COOKIE`).
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

// Sessions stored before the login flow moved here hold the Phoenix shape of the
// user. Converting on read keeps those visitors signed in across the change.
function migrateUser(user: UserDto | User): UserDto {
    return 'profile_complete' in user ? fromApiUser(user) : user;
}

class AuthStore {
    token = $state<string | null>(null);
    user = $state<UserDto | null>(null);

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
    async set(token: string, user: UserDto): Promise<void> {
        this.token = token;
        this.user = user;
        if (!browser) return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
        await storeSessionCookie(token);
        // What the server said about an anonymous visitor (the navigation,
        // whether they may buy or manage) is stale the moment they sign in.
        await invalidateAll();
    }

    setUser(user: UserDto): void {
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
        if (!browser) return;
        localStorage.removeItem(STORAGE_KEY);
        await dropSessionCookie();
    }

    get isAuthed(): boolean {
        return !!this.token;
    }

    get isAdmin(): boolean {
        return this.user?.role === 'admin';
    }
}

export const auth = new AuthStore();
