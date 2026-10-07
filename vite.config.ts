import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [
        sveltekit(),
        SvelteKitPWA({
            registerType: 'autoUpdate',
            // SvelteKit builds with a relative base, which made every page but
            // the home page register `sw.js` next to itself (`/auth/sw.js`,
            // `/events/<id>/sw.js`) and get a 404. The worker lives at the root.
            base: '/',
            manifest: {
                name: 'Tickets',
                short_name: 'Tickets',
                description: 'Event ticketing platform',
                theme_color: '#0f172a',
                background_color: '#0f172a',
                display: 'standalone',
                start_url: '/',
                icons: [
                    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                    {
                        src: '/icon-maskable-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable'
                    }
                ]
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,webmanifest}']
            }
        })
    ]
});
