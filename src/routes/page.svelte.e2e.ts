import { expect, test } from '@playwright/test';

test('shows the Shipyard home link', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('link', { name: 'Shipyard home' })).toBeVisible();
});
