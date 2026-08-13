// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
/// <reference types="vite-plugin-pwa/client" />
import type { Container } from '$lib/container';
import type { SessionUser } from '$lib/modules/sessions/types';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** Resolved from the session cookie in hooks.server.ts; null when anonymous. */
			user: SessionUser | null;
			/** The request's object graph, built by hooks.server.ts. */
			container: Container;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
