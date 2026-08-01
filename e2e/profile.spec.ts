import { test, expect } from '@playwright/test'

const nicknameInput = (page: import('@playwright/test').Page) =>
  page.getByPlaceholder('Enter your nickname')

test.describe('Profile setup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/en/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
  })

  test('prompts new player to set up profile', async ({ page }) => {
    await expect(page.locator('text=Set up your profile to start playing.')).toBeVisible()
  })

  test('profile setup modal opens and validates nickname', async ({ page }) => {
    await page.locator('button:has-text("Set Up Your Profile")').click()
    await expect(page.locator('.modal')).toBeVisible()

    // empty nickname → error
    await page.locator('.modal button:has-text("Save")').click()
    await expect(page.locator('.form-error')).toHaveText('Nickname is required')

    // too long nickname → error
    await nicknameInput(page).fill('A'.repeat(20))
    await page.locator('.modal button:has-text("Save")').click()
    await expect(page.locator('.form-error')).toContainText('16 characters')
  })

  test('saves profile and shows nickname', async ({ page }) => {
    await page.locator('button:has-text("Set Up Your Profile")').click()
    await nicknameInput(page).fill('TestPlayer')
    await page.locator('.modal button:has-text("Save")').click()

    await expect(page.locator('.modal')).not.toBeVisible()
    await expect(page.locator('text=TestPlayer')).toBeVisible()
  })

  test('edit profile updates nickname', async ({ page }) => {
    await page.locator('button:has-text("Set Up Your Profile")').click()
    await nicknameInput(page).fill('OldName')
    await page.locator('.modal button:has-text("Save")').click()
    await expect(page.locator('text=OldName')).toBeVisible()

    await page.locator('button:has-text("Edit")').click()
    await nicknameInput(page).fill('NewName')
    await page.locator('.modal button:has-text("Save")').click()
    await expect(page.locator('text=NewName')).toBeVisible()
  })

  test('nickname character counter works', async ({ page }) => {
    await page.locator('button:has-text("Set Up Your Profile")').click()
    await nicknameInput(page).fill('Hello')
    await expect(page.locator('.modal :text("5/16")')).toBeVisible()
  })

  test('profile persists across page reload', async ({ page }) => {
    await page.locator('button:has-text("Set Up Your Profile")').click()
    await nicknameInput(page).fill('PersistTest')
    await page.locator('.modal button:has-text("Save")').click()

    await page.reload()
    await expect(page.locator('text=PersistTest')).toBeVisible()
  })

  test('joining room without profile opens setup modal', async ({ page }) => {
    const input = page.locator('input[placeholder="Enter room code"]')
    await input.fill('TEST01')
    await page.locator('button:has-text("Join")').click()
    await expect(page.locator('.modal')).toBeVisible()
    await expect(page.locator('.modal h2')).toHaveText('Set Up Your Profile')
  })
})
