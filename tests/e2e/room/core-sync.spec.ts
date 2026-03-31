import { test, expect } from '@playwright/test';
import { createRoom, joinRoom, waitForEditorToLoad } from './utils/setup';

function normalizeEditorText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

test.describe('Core Sync', () => {
  test.describe.configure({ mode: 'serial' });

  test('should sync code between two users', async ({ page, browser }) => {
    const driverPage = page;

    // 1. Driver creates a new room
    const roomId = await createRoom(driverPage);

    // 2. Navigator joins the same room
    const navigatorContext = await browser.newContext();
    const navigatorPage = await navigatorContext.newPage();
    await joinRoom(navigatorPage, roomId);

    // 3. Driver types some code
    await waitForEditorToLoad(driverPage);
    const driverEditor = driverPage.getByRole('textbox', { name: 'Editor content' }).first();
    const driverViewLines = driverPage.locator('.monaco-editor .view-lines').first();
    const textToType = `console.log("Hello, Navigator!");`;
    await driverEditor.focus();
    await driverPage.keyboard.press('ControlOrMeta+A');
    await driverPage.keyboard.insertText(textToType);

    // 4. Verify the code is synced to the Navigator's editor
    await waitForEditorToLoad(navigatorPage);
    const navigatorEditor = navigatorPage.locator('.monaco-editor').first();
    const navigatorViewLines = navigatorPage.locator('.monaco-editor .view-lines').first();
    await expect
      .poll(
        async () => normalizeEditorText(await navigatorViewLines.innerText()),
        { timeout: 10000 }
      )
      .toContain('Hello, Navigator!');

    // 5. Verify driver's view also still contains the same source
    await expect
      .poll(async () => normalizeEditorText(await driverViewLines.innerText()), {
        timeout: 10000,
      })
      .toContain('Hello, Navigator!');

    await navigatorContext.close();
  });
});
