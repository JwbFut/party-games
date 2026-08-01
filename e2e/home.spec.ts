import { test, expect } from '@playwright/test'

test.describe('Home page', () => {
  test('renders English by default at /en/', async ({ page }) => {
    await page.goto('/en/')
    await expect(page.locator('h1')).toHaveText('Party Games')
    await expect(page.locator('text=Play with friends, right in your browser.')).toBeVisible()
  })

  test('renders Chinese at /zh/', async ({ page }) => {
    await page.goto('/zh/')
    await expect(page.locator('h1')).toHaveText('派对游戏')
    await expect(page.locator('text=打开浏览器，和朋友一起玩。')).toBeVisible()
  })

  test('root redirects to /en/ for English browser', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/en\/?/)
    await expect(page.locator('h1')).toHaveText('Party Games')
  })

  test('language switcher toggles between EN and ZH', async ({ page }) => {
    await page.goto('/en/')
    await expect(page.locator('h1')).toHaveText('Party Games')

    await page.locator('.lang-switcher button:has-text("ZH")').click()
    await expect(page).toHaveURL(/\/zh\//)
    await expect(page.locator('h1')).toHaveText('派对游戏')

    await page.locator('.lang-switcher button:has-text("EN")').click()
    await expect(page).toHaveURL(/\/en\//)
    await expect(page.locator('h1')).toHaveText('Party Games')
  })

  test('join room input navigates to room URL', async ({ page }) => {
    await page.goto('/en/')
    await page.evaluate(() => {
      localStorage.setItem('party-games:profile', JSON.stringify({
        id: 'test-join', nickname: 'Joiner', avatar: null,
      }))
    })
    await page.reload()
    const input = page.locator('input[placeholder="Enter room code"]')
    await input.fill('ABC123')
    await page.locator('button:has-text("Join")').click()
    await expect(page).toHaveURL(/room=ABC123/)
  })

  test('join button disabled for short code', async ({ page }) => {
    await page.goto('/en/')
    const input = page.locator('input[placeholder="Enter room code"]')
    await input.fill('AB')
    await expect(page.locator('button:has-text("Join")')).toBeDisabled()
  })

  test('werewolf game card links to info page', async ({ page }) => {
    await page.goto('/en/')
    await page.locator('a:has-text("Word Werewolf")').click()
    await expect(page).toHaveURL(/games\/werewolf/)
    await expect(page.locator('h1')).toHaveText('Word Werewolf')
  })
})

test.describe('SEO', () => {
  test('home page has correct meta tags', async ({ page }) => {
    await page.goto('/en/')
    await expect(page).toHaveTitle(/Party Games/)
    const desc = page.locator('meta[name="description"]').last()
    await expect(desc).toHaveAttribute('content', /browser-based party games/i)
  })

  test('Chinese home page has localized meta', async ({ page }) => {
    await page.goto('/zh/')
    await expect(page).toHaveTitle(/和朋友在线畅玩/)
  })

  test('werewolf info page has game-specific SEO', async ({ page }) => {
    await page.goto('/en/games/werewolf')
    await expect(page).toHaveTitle(/Word Werewolf/)
    const desc = page.locator('meta[name="description"]').last()
    await expect(desc).toHaveAttribute('content', /Word Werewolf/i)
  })

  test('hreflang alternates present', async ({ page }) => {
    await page.goto('/en/')
    const enAlt = page.locator('link[hreflang="en"]')
    const zhAlt = page.locator('link[hreflang="zh"]')
    expect(await enAlt.count()).toBeGreaterThanOrEqual(1)
    expect(await zhAlt.count()).toBeGreaterThanOrEqual(1)
  })

  test('html lang attribute matches route', async ({ page }) => {
    await page.goto('/en/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')

    await page.goto('/zh/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh')
  })

  test('JSON-LD structured data present', async ({ page }) => {
    await page.goto('/en/')
    const jsonLd = page.locator('script[type="application/ld+json"]')
    await expect(jsonLd).toHaveCount(1)
    const content = await jsonLd.textContent()
    expect(content).toContain('WebApplication')
  })
})
