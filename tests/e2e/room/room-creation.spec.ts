import { test, expect } from '@playwright/test';
import { createRoom } from './utils/setup';

test.describe('Room Creation and Navigation', () => {
  test('should create a new room and navigate to it', async ({ page }) => {
    const roomId = await createRoom(page);
    expect(roomId).toMatch(/^[a-z]{3}-[a-z]{3}-[a-z]{3}$/);

    // Validate core UI loaded
    await expect(page.locator('.xterm').first()).toBeVisible();
  });
});
