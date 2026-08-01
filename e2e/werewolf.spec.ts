import { test, expect, type Browser, type Page } from '@playwright/test'

const ROOM_CODE = 'PWTEST'
const PLAYER_COUNT = 16
const TOWN_COUNT = 12
const MAFIA_COUNT = 4

function profileFor(i: number) {
  return {
    id: `player-${i.toString().padStart(2, '0')}`,
    nickname: `Player${i.toString().padStart(2, '0')}`,
    avatar: null,
  }
}

const LOCAL_MQTT = 'ws://localhost:18830'

async function setupProfile(page: Page, i: number) {
  await page.goto('/en/')
  await page.evaluate(({ p, mqtt }) => {
    localStorage.setItem('party-games:profile', JSON.stringify(p))
    localStorage.setItem('party-games:mqtt', mqtt)
  }, { p: profileFor(i), mqtt: LOCAL_MQTT })
}

async function retry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 2000): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      if (i === attempts - 1) throw e
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
  throw new Error('unreachable')
}

async function waitForRoomConnected(page: Page, timeout = 30_000) {
  try {
    await page.waitForSelector('.room-code-display', { timeout })
  } catch {
    const text = await page.textContent('body').catch(() => '(empty)')
    const url = page.url()
    throw new Error(`Room did not connect.\n  URL: ${url}\n  Body: ${text?.slice(0, 300)}`)
  }
}

async function joinRoomWithRetry(page: Page, code: string, i: number) {
  await retry(async () => {
    await page.goto(`/en/?room=${code}`)
    await waitForRoomConnected(page, 20_000)
  }, 3, 3000)
}

async function submitWordWithRetry(page: Page, word: string) {
  await retry(async () => {
    const input = page.locator('.word-input-area input')
    try {
      await expect(input).toBeVisible({ timeout: 20_000 })
    } catch {
      // Already past word phase (Day/Night banner visible) — word was submitted in a prior attempt
      const pastWord = await page.locator('.phase-banner').isVisible().catch(() => false)
      if (pastWord) return
      const body = await page.textContent('body').catch(() => '?')
      throw new Error(`word input not found. Body: ${body?.slice(0, 200)}`)
    }
    await input.fill(word)
    await page.locator('button:has-text("Submit Word")').click()
    // Accept either confirmation or phase already advanced
    await Promise.race([
      page.locator('text=Word submitted').waitFor({ timeout: 10_000 }),
      page.locator('.phase-banner').waitFor({ timeout: 10_000 }),
    ])
  }, 3, 3000)
}

async function voteWithRetry(page: Page) {
  await retry(async () => {
    const voteBtn = page.locator('.vote-btn').first()
    await expect(voteBtn).toBeVisible({ timeout: 15_000 })
    await voteBtn.click()
  }, 3, 2000)
}

test.describe('Werewolf 16-player game', () => {
  test.setTimeout(300_000)
  test.describe.configure({ retries: 2 })

  // P2P requires WebRTC — only reliable in Chromium headless
  test.beforeEach(({ browserName }) => {
    test.skip(browserName == 'firefox', 'WebRTC default to disabled in Firefox')
  })

  test('full game: lobby → words → day vote → night kill → second round', async ({ browser }) => {
    // ── 0. Pre-check: browser can reach local MQTT broker ──
    const checkPage = await browser.newPage()
    const wsOk = await checkPage.evaluate(() => new Promise<boolean>((resolve) => {
      const ws = new WebSocket('ws://localhost:18830')
      ws.onopen = () => { ws.close(); resolve(true) }
      ws.onerror = () => resolve(false)
      setTimeout(() => resolve(false), 5000)
    }))
    await checkPage.close()
    if (!wsOk) throw new Error('Cannot connect to local MQTT broker at ws://localhost:18830')

    // ── 1. Create 16 isolated contexts with unique profiles ──
    const contexts = await Promise.all(
      Array.from({ length: PLAYER_COUNT }, async (_, i) => {
        const ctx = await browser.newContext()
        const page = await ctx.newPage()
        await setupProfile(page, i)
        return { ctx, page }
      }),
    )
    const pages = contexts.map(c => c.page)
    const [host, ...players] = pages

    // Capture host console for debugging
    const hostLogs: string[] = []
    host.on('console', (msg) => {
      const text = msg.text()
      if (text.includes('[WW]') || text.includes('[Room]')) hostLogs.push(text)
    })

    // ── 2. Host creates room ──
    await host.goto(`/en/?room=${ROOM_CODE}&host=1`)
    await waitForRoomConnected(host)
    await expect(host.locator('.room-code-display')).toHaveText(ROOM_CODE)

    // ── 3. 15 players join in batches of 5 (avoid overwhelming broker) ──
    for (let i = 0; i < players.length; i += 5) {
      const batch = players.slice(i, i + 5)
      await Promise.all(batch.map((p, j) => joinRoomWithRetry(p, ROOM_CODE, i + j + 1)))
      await new Promise(r => setTimeout(r, 2000)) // let broker breathe
    }

    // Wait for host to see all 16 players
    await expect(host.locator('.player-row')).toHaveCount(PLAYER_COUNT, { timeout: 60_000 })

    // ── 4. Host configures roles: 12 town + 4 mafia ──
    await host.locator('.config-row input').first().fill(String(TOWN_COUNT))
    await host.locator('.config-row input').last().fill(String(MAFIA_COUNT))

    // ── 5. Host starts game ──
    await host.locator('button:has-text("Start Game")').click()

    // All players should see word collection phase
    for (const p of pages) {
      await expect(p.locator('text=Word Collection')).toBeVisible({ timeout: 30_000 })
    }

    // ── 6. All 16 players submit words with retry ──
    await Promise.all(
      pages.map((p, i) => submitWordWithRetry(p, `word-${i}`)),
    )

    // ── 7. Day phase ──
    for (const p of pages) {
      await expect(p.locator('.phase-banner')).toContainText('Day', { timeout: 30_000 })
    }

    // Verify the selected word is visible
    await expect(host.locator('text=The word is')).toBeVisible()

    // ── 8. All 16 players vote with retry ──
    await Promise.all(pages.map(p => voteWithRetry(p)))

    // ── 9. Day result ──
    await expect(host.locator('text=Vote Result')).toBeVisible({ timeout: 30_000 })
    for (const p of pages) {
      await expect(p.locator('text=Vote Result')).toBeVisible({ timeout: 30_000 })
    }

    // ── 10. Night phase (auto-transition after ~3s) ──
    for (const p of pages) {
      await expect(p.locator('.phase-banner')).toContainText('Night', { timeout: 30_000 })
    }

    // ── 11. Night vote: all pages try, only mafia have vote buttons ──
    let mafiaVoteCount = 0
    await Promise.all(
      pages.map(async (p) => {
        const voteBtn = p.locator('.vote-btn').first()
        const visible = await voteBtn.isVisible().catch(() => false)
        if (!visible) return // town or dead — no vote buttons at night
        await voteBtn.click()
        mafiaVoteCount++
      }),
    )
    expect(mafiaVoteCount).toBeGreaterThanOrEqual(1)

    // ── 12. Night result or game over ──
    await Promise.race([
      host.locator('text=Night Result').waitFor({ timeout: 30_000 }),
      host.locator('text=Game Over').waitFor({ timeout: 30_000 }),
    ]).catch(async () => {
      const body = await host.textContent('body').catch(() => '?')
      throw new Error(`Night result timeout.\n  Host body: ${body?.slice(0, 200)}\n  Host logs:\n${hostLogs.slice(-20).join('\n')}`)
    })

    // ── 13. Verify game state ──
    const gameOver = await host.locator('text=Game Over').isVisible().catch(() => false)

    if (!gameOver) {
      // Round 2: wait for word collection or game over (3s transition delay)
      for (const p of pages) {
        await Promise.race([
          p.locator('text=Word Collection').waitFor({ timeout: 15_000 }),
          p.locator('text=Game Over').waitFor({ timeout: 15_000 }),
        ]).catch(() => {}) // dead players may see neither; that's ok
      }

      // Verify host reached round 2
      const inRound2 = await host.locator('text=Word Collection').isVisible().catch(() => false)
        || await host.locator('text=Game Over').isVisible().catch(() => false)
      expect(inRound2).toBe(true)
    }

    // ── Cleanup ──
    await Promise.all(contexts.map(c => c.ctx.close()))
  })

  test('duplicate join reconnects', async ({ browser }) => {
    const ctx1 = await browser.newContext()
    const ctx2 = await browser.newContext()
    const page1 = await ctx1.newPage()
    const page2 = await ctx2.newPage()

    const profile = profileFor(99)
    for (const p of [page1, page2]) {
      await p.goto('/en/')
      await p.evaluate(({ pr, mqtt }) => {
        localStorage.setItem('party-games:profile', JSON.stringify(pr))
        localStorage.setItem('party-games:mqtt', mqtt)
      }, { pr: profile, mqtt: LOCAL_MQTT })
    }

    await page1.goto('/en/?room=DUPTEST&host=1')
    await waitForRoomConnected(page1)

    // Same profile joins again → re-accepted (reconnect), not rejected
    await page2.goto('/en/?room=DUPTEST')
    await waitForRoomConnected(page2)

    await ctx1.close()
    await ctx2.close()
  })

  test('room collision: second host is rejected', async ({ browser }) => {
    const ctx1 = await browser.newContext()
    const ctx2 = await browser.newContext()
    const page1 = await ctx1.newPage()
    const page2 = await ctx2.newPage()

    for (const [p, i] of [[page1, 97], [page2, 98]] as const) {
      await p.goto('/en/')
      await p.evaluate(({ pr, mqtt }) => {
        localStorage.setItem('party-games:profile', JSON.stringify(pr))
        localStorage.setItem('party-games:mqtt', mqtt)
      }, { pr: profileFor(i), mqtt: LOCAL_MQTT })
    }

    await page1.goto('/en/?room=COLTEST&host=1')
    await waitForRoomConnected(page1)

    await page2.goto('/en/?room=COLTEST&host=1')
    await expect(page2.locator('text=This room already has a host.')).toBeVisible({ timeout: 30_000 })

    await ctx1.close()
    await ctx2.close()
  })

  test('game started: new player rejected', async ({ browser }) => {
    const contexts = await Promise.all(
      Array.from({ length: 4 }, async (_, i) => {
        const ctx = await browser.newContext()
        const page = await ctx.newPage()
        await setupProfile(page, i + 40)
        return { ctx, page }
      }),
    )
    const [hostPage, p2, p3, latecomer] = contexts.map(c => c.page)

    await hostPage.goto('/en/?room=LOCKTEST&host=1')
    await waitForRoomConnected(hostPage)
    await p2.goto('/en/?room=LOCKTEST')
    await waitForRoomConnected(p2)
    await p3.goto('/en/?room=LOCKTEST')
    await waitForRoomConnected(p3)
    await expect(hostPage.locator('.player-row')).toHaveCount(3, { timeout: 30_000 })

    await hostPage.locator('.config-row input').first().fill('2')
    await hostPage.locator('.config-row input').last().fill('1')
    await hostPage.locator('button:has-text("Start Game")').click()

    await latecomer.goto('/en/?room=LOCKTEST')
    await expect(latecomer.locator('text=Game in progress')).toBeVisible({ timeout: 30_000 })

    await Promise.all(contexts.map(c => c.ctx.close()))
  })
})
