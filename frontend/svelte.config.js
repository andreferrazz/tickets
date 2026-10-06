import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter(),
		typescript: {
			// db/ and e2e/ run under plain Node and Playwright, outside Vite, but they
			// are still this project's TypeScript: `npm run check` must cover them.
			config: (tsconfig) => {
				tsconfig.include.push('../db/**/*.ts', '../e2e/**/*.ts');
				return tsconfig;
			}
		}
	}
};

export default config;
