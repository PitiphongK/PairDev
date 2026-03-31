import { test, expect } from '@playwright/test';
import { createRoom, joinRoom, waitForEditorToLoad } from './utils/setup';

function normalizeEditorText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

test.describe('Role Permissions', () => {
  test.describe.configure({ mode: 'serial' });

  test('should keep navigator read-only while driver can edit', async ({ page, browser }) => {
    const driverPage = page;
    const roomId = await createRoom(driverPage);

    const navigatorContext = await browser.newContext();
    const navigatorPage = await navigatorContext.newPage();
    await joinRoom(navigatorPage, roomId);

    await waitForEditorToLoad(driverPage);
    await waitForEditorToLoad(navigatorPage);

    const driverEditor = driverPage.getByRole('textbox', { name: 'Editor content' }).first();
    const driverViewLines = driverPage.locator('.monaco-editor .view-lines').first();
    const navigatorEditor = navigatorPage.getByRole('textbox', { name: 'Editor content' }).first();
    const navigatorViewLines = navigatorPage.locator('.monaco-editor .view-lines').first();

    const driverText = `console.log("Driver writes");`;
    await driverEditor.focus();
    await driverPage.keyboard.press('ControlOrMeta+A');
    await driverPage.keyboard.insertText(driverText);

    await expect
      .poll(
        async () => normalizeEditorText(await navigatorViewLines.innerText()),
        { timeout: 10000 }
      )
      .toContain('Driver writes');

    const attemptedNavigatorText = `console.log("Navigator cannot write");`;
    await navigatorEditor.focus();
    await navigatorPage.keyboard.press('ControlOrMeta+A');
    await navigatorPage.keyboard.insertText(attemptedNavigatorText);
    await navigatorPage.waitForTimeout(400);

    await expect
      .poll(
        async () => normalizeEditorText(await navigatorViewLines.innerText()),
        { timeout: 4000 }
      )
      .not.toContain('Navigator cannot write');

    await expect
      .poll(
        async () => normalizeEditorText(await driverViewLines.innerText()),
        { timeout: 4000 }
      )
      .toContain('Driver writes');

    await navigatorContext.close();
  });
});
