import { test, expect } from '@playwright/test'

test('fullscreen giriş/çıkışında canvas boyutu ve çizimi korunur', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 760 })
  await page.goto('/')
  const present = page.locator('button[title*="Sunum modu"], button[title*="Presentation mode"]').first()
  await present.click()
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true)

  const fullscreenCanvas = await page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const pixel = canvas.getContext('2d')!.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data
    return { width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height, alpha: pixel[3] }
  })
  expect(fullscreenCanvas.cssWidth).toBeGreaterThan(0)
  expect(fullscreenCanvas.cssHeight).toBeGreaterThan(0)
  expect(fullscreenCanvas.width).toBeGreaterThan(0)
  expect(fullscreenCanvas.height).toBeGreaterThan(0)
  expect(fullscreenCanvas.alpha).toBeGreaterThan(0)

  await page.keyboard.press('Escape')
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false)
  await expect.poll(() => page.locator('canvas').first().evaluate((canvas) => (canvas as HTMLCanvasElement).width)).toBeGreaterThan(0)
})
