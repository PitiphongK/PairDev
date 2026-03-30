import { test, expect } from '@playwright/test';

test.describe('Join Guardrails', () => {
  test('should redirect invalid room code to home and show invalid-code toast', async ({ page }) => {
    await page.goto('/rooms/not-a-valid-code');

    await expect(page.getByText('Invalid room code')).toBeVisible({ timeout: 6000 });
    await expect(page.getByRole('button', { name: 'Join' })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test('should redirect missing room to home and show room-not-found toast', async ({ page }) => {
    await page.goto('/rooms/zzz-yyy-xxx');

    await expect(page.getByText('Room not found')).toBeVisible({ timeout: 6000 });
    await expect(page.getByRole('button', { name: 'Join' })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });
});
