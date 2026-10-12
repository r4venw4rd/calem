import { test, expect } from '@playwright/test'

test('page strip renders the visible thumbnail batch first, then the remaining pages', async ({ page }) => {
  await page.goto('/')
  const add = page.locator('button[title*="New page"], button[title*="Yeni sayfa"]').first()
  await add.click()
  await add.click()
  await add.click()

  await page.locator('button[title*="Page strip"], button[title*="Sayfa şeridi"]').first().click()
  const strip = page.locator('[aria-label="Sayfa şeridi"], [aria-label="Page strip"]')
  await expect(strip).toBeVisible()
  const images = strip.locator('img')
  await expect(images).toHaveCount(4)
  await strip.evaluate((el) => { el.scrollTop = 0 })
  await strip.dispatchEvent('scroll')

  await expect.poll(async () => images.evaluateAll((els) => els.slice(0, 2).every((el) => (el as HTMLImageElement).src.startsWith('data:')))).toBe(true)
  await expect.poll(async () => images.evaluateAll((els) => els.filter((el) => (el as HTMLImageElement).src).length)).toBe(4)
})
