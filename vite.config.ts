import { svelteDevtools } from '@sveltejs/vite-devtools-svelte';
import { link_check } from '@mdsvex/plugin-link-check';
import { page_data } from '@mdsvex/plugin-page-data';
import { references } from '@mdsvex/plugin-references';
import { external_links } from '@mdsvex/plugin-external-links';
import { anchors } from '@mdsvex/plugin-anchors';
import { figures } from '@mdsvex/plugin-figures';
import { embeds } from '@mdsvex/plugin-embeds';
import { code_blocks } from '@mdsvex/plugin-code-blocks';
import { elements } from '@mdsvex/plugin-elements';
import { mdsvex } from 'mdsvex';
import { enhancedImages } from '@sveltejs/enhanced-img';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-bun';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
	plugins: [
		svelteDevtools(),
		mdsvex({
			heading_ids: true,
			unwrap_images: true,
			plugins: [
				elements(),
				code_blocks(),
				embeds(),
				figures(),
				anchors(),
				external_links(),
				references(),
				page_data(),
				link_check()
			]
		}),
		enhancedImages(),
		sveltekit({
			preprocess: vitePreprocess(),
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}', 'src/lib/server/**']
				}
			}
		]
	},
	devtools: { apply: 'serve', clientAuth: true }
});
