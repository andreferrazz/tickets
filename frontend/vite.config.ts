import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			manifest: {
				name: 'Tickets',
				short_name: 'Tickets',
				description: 'Event ticketing platform',
				theme_color: '#0f172a',
				background_color: '#0f172a',
				display: 'standalone',
				start_url: '/',
				icons: [
					{ src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
					{ src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' }
				]
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,svg,png,ico,webp}']
			}
		})
	]
});
