import { test, expect } from '@playwright/test';

test('ingest data, save, reopen, and clear', async ({ page }) => {
  await page.goto('/');

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles('tests/fixtures/sample.csv');

  await page.getByRole('button', { name: 'Ingest Data' }).click();
  await expect(page.getByText('Connected')).toBeVisible();

  await page.getByRole('button', { name: 'Save & Exit' }).click();
  await expect(page.getByRole('heading', { name: 'Explorations' })).toBeVisible();

  await page.getByRole('button', { name: 'Open Exploration' }).click();
  await expect(page.getByRole('button', { name: 'Clear data' })).toBeVisible();

  await page.getByRole('button', { name: 'Clear data' }).click();
  await expect(page.locator('strong', { hasText: 'No data' })).toBeVisible();
});
