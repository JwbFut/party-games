import { test, expect } from '@playwright/test'

test.describe('Game info page', () => {
  test('English werewolf info page renders', async ({ page }) => {
    await page.goto('/en/games/werewolf')
    await expect(page.locator('h1')).toHaveText('Word Werewolf')
    await expect(page.locator('text=A social deduction game with a twist of words')).toBeVisible()
    await expect(page.locator('text=How to Play')).toBeVisible()
    await expect(page.locator('text=Rules')).toBeVisible()
  })

  test('Chinese werewolf info page renders', async ({ page }) => {
    await page.goto('/zh/games/werewolf')
    await expect(page.locator('h1')).toHaveText('自定义词狼人杀')
    await expect(page.locator('text=带有词语元素的社交推理游戏')).toBeVisible()
    await expect(page.locator('text=玩法说明')).toBeVisible()
    await expect(page.locator('text=规则')).toBeVisible()
  })

  test('lists all 6 how-to-play steps', async ({ page }) => {
    await page.goto('/en/games/werewolf')
    const steps = page.locator('ol li')
    await expect(steps).toHaveCount(6)
  })

  test('lists all 4 rules', async ({ page }) => {
    await page.goto('/en/games/werewolf')
    const rules = page.locator('ul li')
    await expect(rules).toHaveCount(4)
  })

  test('Play Now button creates a room', async ({ page }) => {
    await page.goto('/en/games/werewolf')
    await page.evaluate(() => {
      localStorage.setItem('party-games:profile', JSON.stringify({
        id: 'test-id', nickname: 'Tester', avatar: null,
      }))
    })
    await page.reload()
    await page.locator('button:has-text("Play Now")').click()
    await expect(page).toHaveURL(/room=.*&host=1/)
  })

  test('back link returns to home', async ({ page }) => {
    await page.goto('/en/games/werewolf')
    await page.locator('a:has-text("Home")').click()
    await expect(page).toHaveURL(/\/en\/?$/)
    await expect(page.locator('h1')).toHaveText('Party Games')
  })

  test('tie-break rules documented correctly', async ({ page }) => {
    await page.goto('/en/games/werewolf')
    await expect(page.locator('text=Day vote tie: no one is eliminated that round.')).toBeVisible()
    await expect(page.locator('text=Mafia night vote tie: a random target among the top-voted is chosen.')).toBeVisible()
  })
})
