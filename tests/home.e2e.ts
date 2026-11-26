import { expect, test } from '@playwright/test';

test('responsive project directory, search, and account access', async ({ page }) => {
	await page.route('**/api/projects?*', (route) =>
		route.fulfill({
			json: {
				projects: Array.from({ length: 8 }, (_, i) => ({
					id: String(i),
					repositoryUrl: `https://github.com/campus/project-${i}`,
					status: 'active',
					metadata: {
						name: `Campus project ${i}`,
						description: 'A student-led campus tool.',
						topics: ['campus'],
						techStack: ['TypeScript', 'Svelte'],
						stars: 12,
						goodFirstIssues: []
					}
				})),
				nextOffset: null
			}
		})
	);
	await page.route('**/api/auth/request-otp', (route) =>
		route.fulfill({ json: { message: 'sent' } })
	);
	await page.route('**/api/auth/me', (route) => route.fulfill({ json: { user: null } }));
	await page.goto('/');
	await expect(page.locator('.project-card')).toHaveCount(8);
	await expect(
		page.getByRole('link', { name: 'View campus on GitHub (opens in a new tab)' }).first()
	).toHaveAttribute('href', 'https://github.com/campus');
	await expect(
		page.getByRole('link', { name: 'Campus project 0 — view repository (opens in a new tab)' })
	).toHaveAttribute('href', 'https://github.com/campus/project-0');
	for (const [width, columns] of [
		[1440, 4],
		[1024, 4],
		[768, 2],
		[390, 1]
	]) {
		await page.setViewportSize({ width, height: 1000 });
		const layout = await page.locator('.grid').evaluate((el) => ({
			columns: getComputedStyle(el).gridTemplateColumns.split(' ').length,
			overflow: document.documentElement.scrollWidth > innerWidth
		}));
		expect(layout).toEqual({ columns, overflow: false });
		const box = await page.locator('.project-card').first().boundingBox();
		expect(box!.width / box!.height).toBeCloseTo(3 / 4, 2);
	}
	await page.locator('.search').click();
	await expect(page.getByRole('searchbox')).toBeFocused();
	await page.getByRole('searchbox').fill('project 3');
	await expect(page.locator('.project-card')).toHaveCount(1);
	await page.getByRole('searchbox').fill('no matches');
	await expect(page.getByRole('heading', { name: 'No projects found.' })).toBeVisible();
	await page.getByRole('searchbox').fill('');
	await expect(page.locator('.project-card')).toHaveCount(8);
	await page.getByRole('button', { name: 'Account', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Sign Up' })).toBeVisible();
	await expect(page.locator('.account-pill')).toHaveCSS('visibility', 'hidden');
	await expect(page.getByLabel('Campus e-mail')).toBeVisible();
	await page.getByLabel('Campus e-mail').fill('student@svyasa-sas.edu.in');
	await page.getByLabel('Campus e-mail').press('Enter');
	await expect(page.getByRole('status')).toContainText('sign-in link');
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).not.toBeVisible();
	await expect(page.locator('.account-pill')).toBeVisible();
	await expect(page.locator('.account-pill')).toBeFocused();
	await page.locator('.account-pill').click();
	await expect(page.getByRole('dialog', { name: 'Sign Up' })).toBeVisible();
	await page.waitForTimeout(500);
	await page.getByRole('button', { name: 'Close account' }).click();
	await expect(page.locator('#account')).toHaveClass(/closing/);
	await expect(page.getByRole('dialog')).not.toBeVisible();
	await expect(page.locator('.account-pill')).toBeFocused();
});

test('signs in from the emailed link', async ({ page }) => {
	const email = 'student@svyasa-sas.edu.in';
	const token = 'a'.repeat(64);
	await page.route('**/api/projects?*', (route) =>
		route.fulfill({ json: { projects: [], nextOffset: null } })
	);
	await page.route('**/api/auth/verify-otp', async (route) => {
		expect(route.request().postDataJSON()).toEqual({ email, code: token });
		await route.fulfill({ json: { user: { id: '1', email } } });
	});
	await page.goto(`/#email=${encodeURIComponent(email)}&token=${token}`);
	await expect(page.getByRole('button', { name: /student/ })).toBeVisible();
	await expect.poll(() => new URL(page.url()).hash).toBe('');
});

test('renders the WebGPU background and responds to pointer movement', async ({ page }) => {
	await page.setViewportSize({ width: 800, height: 600 });
	await page.route('**/api/projects?*', (route) =>
		route.fulfill({ json: { projects: [], nextOffset: null } })
	);
	await page.route('**/api/auth/me', (route) => route.fulfill({ json: { user: null } }));
	await page.goto('/');

	const background = page.locator('.shader-background canvas');
	await expect(background).toBeVisible();
	const readPixels = () =>
		background.evaluate(async (element) => {
			const image = new Image();
			image.src = (element as HTMLCanvasElement).toDataURL();
			await image.decode();
			const sampler = document.createElement('canvas');
			sampler.width = 32;
			sampler.height = 24;
			const context = sampler.getContext('2d')!;
			context.drawImage(image, 0, 0, sampler.width, sampler.height);
			const pixels = Array.from(context.getImageData(0, 0, sampler.width, sampler.height).data);
			return pixels.some((value, index) => index % 4 === 3 && value > 0) ? pixels : null;
		});

	await page.mouse.move(160, 150);
	await expect.poll(readPixels).not.toBeNull();
	const left = await readPixels();
	await expect
		.poll(async () => {
			const later = await readPixels();
			return Boolean(left && later?.some((value, index) => value !== left[index]));
		})
		.toBe(true);
	await page.mouse.move(640, 450);
	await expect
		.poll(async () => {
			const right = await readPixels();
			return Boolean(left && right?.some((value, index) => value !== left[index]));
		})
		.toBe(true);
});

test('account motion respects reduced motion and can be reopened', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.route('**/api/projects?*', (route) =>
		route.fulfill({ json: { projects: [], nextOffset: null } })
	);
	await page.route('**/api/auth/me', (route) => route.fulfill({ json: { user: null } }));
	await page.goto('/');
	const account = page.getByRole('button', { name: 'Account', exact: true });
	const dialog = page.getByRole('dialog', { name: 'Sign Up' });
	await account.click();
	await expect(dialog).toBeVisible();
	await expect(dialog).toHaveCSS('transform', 'none');
	await page.getByRole('button', { name: 'Close account' }).click();
	await expect(dialog).not.toBeVisible();
	await account.click();
	await expect(dialog).toBeVisible();
});
