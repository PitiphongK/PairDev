import { test, expect } from '@playwright/test';
import { createRoom, waitForEditorToLoad } from './utils/setup';

test.describe('Terminal Run Error Path', () => {
  test('should show terminal error when running empty code', async ({ page }) => {
    const roomId = await createRoom(page);
    expect(roomId).toMatch(/^[a-z]{3}-[a-z]{3}-[a-z]{3}$/);

    await waitForEditorToLoad(page);
    await expect(page.locator('.xterm').first()).toBeVisible();

    const stillConnecting = await page
      .getByText('Connecting…')
      .first()
      .isVisible()
      .catch(() => false);

    test.skip(stillConnecting, 'Terminal server is not reachable in this environment.');

    const editor = page.getByRole('textbox', { name: 'Editor content' }).first();
    await editor.focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');

    await page.getByRole('button', { name: 'Run' }).click();

    const terminalRows = page.locator('.xterm-rows:visible').first();
    await expect
      .poll(async () => (await terminalRows.innerText()).replace(/\s+/g, ' '), {
        timeout: 10000,
      })
      .toMatch(/No code provided|\[error:/i);
  });
});
