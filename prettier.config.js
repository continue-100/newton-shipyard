/** @type {import("prettier").Config} */
const config = {
	useTabs: true,
	singleQuote: true,
	trailingComma: 'none',
	printWidth: 100,
	plugins: ['prettier-plugin-svelte', '@mdsvex/prettier-plugin'],
	overrides: [{ files: '*.svelte', options: { parser: 'svelte' } }]
};

export default config;
