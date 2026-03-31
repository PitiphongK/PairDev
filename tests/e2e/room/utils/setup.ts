import { expect, type Page } from '@playwright/test'

const ROOM_URL_PATTERN = /\/rooms\/([a-z]{3}-[a-z]{3}-[a-z]{3})/

export async function createRoom(page: Page): Promise<string> {
	await page.goto('/')

	await page.getByRole('button', { name: /^Create$/ }).click()

	await expect(
		page.getByRole('heading', { name: "What's your name?" })
	).toBeVisible()
	await page.getByPlaceholder('Enter your name').fill('Driver')
	await page.getByRole('button', { name: /^Create Room$/ }).click()

	await page.waitForURL(ROOM_URL_PATTERN)
	const match = page.url().match(ROOM_URL_PATTERN)
	if (!match) {
		throw new Error(`Expected room URL, got: ${page.url()}`)
	}

	await waitForEditorToLoad(page)

	return match[1]
}

export async function joinRoom(page: Page, roomId: string): Promise<void> {
  await page.goto(`/rooms/${roomId}`)
  await page.waitForURL(new RegExp(`\\/\\?join=${roomId}$`))

  await page.getByPlaceholder('Enter your name').fill('Navigator')
  await page.getByRole('button', { name: /^Enter Room$/ }).click()

  await page.waitForURL(new RegExp(`/rooms/${roomId}$`))
  await waitForEditorToLoad(page)
}

export async function dismissRoleNoticeIfPresent(page: Page): Promise<void> {
  const dismissButton = page
    .getByRole('button', { name: /^(OK|Got it)$/ })
    .first()

  try {
    await dismissButton.click({ timeout: 1200 })
    await page.waitForTimeout(120)
  } catch {
    // Modal is not present or already closing.
  }

  // Best-effort fallback for transient overlays.
  await page.keyboard.press('Escape').catch(() => undefined)
}

export async function waitForEditorToLoad(page: Page): Promise<void> {
  await dismissRoleNoticeIfPresent(page)
  await expect(page.locator('.monaco-editor').first()).toBeVisible({
    timeout: 15000,
  })
  await dismissRoleNoticeIfPresent(page)
}
