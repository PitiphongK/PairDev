import { test, expect } from '@playwright/test';
import { createRoom, joinRoom, waitForEditorToLoad } from './utils/setup';

function normalizeEditorText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

test.describe('Terminal Relay', () => {
  test.describe.configure({ mode: 'serial' });

  test('should relay terminal output between two users', async ({ page, browser }) => {
    const driverPage = page;

    // 1. Driver creates a new room
    const roomId = await createRoom(driverPage);
    await expect(driverPage.locator('.xterm').first()).toBeVisible();

    // 2. Navigator joins the same room
    const navigatorContext = await browser.newContext();
    const navigatorPage = await navigatorContext.newPage();
    await joinRoom(navigatorPage, roomId);
    await expect(navigatorPage.locator('.xterm').first()).toBeVisible();

    // 3. Driver types a command to be executed
    await waitForEditorToLoad(driverPage);
    const driverEditor = driverPage.getByRole('textbox', { name: 'Editor content' }).first();
    const navigatorViewLines = navigatorPage.locator('.monaco-editor .view-lines').first();
    const commandToRun = `console.log('Hello from the terminal!');`;
    await driverEditor.focus();
    await driverPage.keyboard.press('ControlOrMeta+A');
    await driverPage.keyboard.insertText(commandToRun);

    // Wait for the code to sync to the navigator
    await waitForEditorToLoad(navigatorPage);
    await expect
      .poll(
        async () => normalizeEditorText(await navigatorViewLines.innerText()),
        { timeout: 10000 }
      )
      .toContain('Hello from the terminal!');

    // 4. Driver clicks the 'Run' button
    await driverPage.getByRole('button', { name: 'Run' }).click();

    // 5. Verify the output is relayed to both terminals
    const driverTerminalRows = driverPage.locator('.xterm-rows:visible').first();
    const navigatorTerminalRows = navigatorPage.locator('.xterm-rows:visible').first();

    // Check for output in driver's terminal
    await expect
      .poll(async () => (await driverTerminalRows.innerText()).replace(/\s+/g, ' '), {
        timeout: 10000,
      })
      .toMatch(/Hello from the terminal!|run error/i);

    // Check for output in navigator's terminal
    await expect
      .poll(async () => (await navigatorTerminalRows.innerText()).replace(/\s+/g, ' '), {
        timeout: 10000,
      })
      .toMatch(/Hello from the terminal!|run error/i);

    await navigatorContext.close();
  });
});
