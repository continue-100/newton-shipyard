import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'bun run --bun build && bun run --bun preview --host 127.0.0.1',
		port: 4173
	},
	use: {
		baseURL: 'http://127.0.0.1:4173',
		browserName: 'chromium',
		launchOptions: {
			args: [
				'--enable-unsafe-webgpu',
				'--enable-unsafe-swiftshader',
				'--use-angle=swiftshader',
				'--use-vulkan=swiftshader',
				'--enable-features=Vulkan'
			]
		}
	},
	testMatch: '**/*.e2e.{ts,js}'
});
