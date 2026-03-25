import { expect, type Page } from '@playwright/test'

const ROOM_URL_PATTERN = /\/rooms\/([a-z]{3}-[a-z]{3}-[a-z]{3})/

export async function createRoom(page: Page): Promise<string> {
	await page.goto('/')

	// Step 1: open create-name step
	await page.getByRole('button', { name: /^Create$/ }).click()

	// Step 2: confirm room creation
	await expect(
		page.getByRole('heading', { name: "What's your name?" })
	).toBeVisible()
	await page.getByRole('button', { name: /^Create Room$/ }).click()

	// Wait until room page is loaded and return generated room id
	await page.waitForURL(ROOM_URL_PATTERN)
	const match = page.url().match(ROOM_URL_PATTERN)
	if (!match) {
		throw new Error(`Expected room URL, got: ${page.url()}`)
	}

	return match[1]
}
