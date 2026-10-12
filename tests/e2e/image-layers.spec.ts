import { test, expect, type Page } from '@playwright/test'

const addImage = async (page: Page, color: string, fileName: string, x: number, y: number) => {
  await page.locator('button[title*="Resim (G)"], button[title*="Image (G)"]').click()
  await page.mouse.click(x, y)
  const png = await page.evaluate((fill) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 120
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = fill
    ctx.fillRect(0, 0, 120, 120)
    return canvas.toDataURL('image/png').split(',')[1]!
  }, color)
  await page.locator('input[type="file"][accept*="image"]').setInputFiles({
    name: fileName.replace(/\.svg$/, '.png'),
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  })
  await page.waitForTimeout(300)
}

const pixelAt = (page: Page, x: number, y: number) =>
  page.evaluate(
    ({ x, y }) => {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement
      const rect = canvas.getBoundingClientRect()
      const px = Math.floor(((x - rect.left) * canvas.width) / rect.width)
      const py = Math.floor(((y - rect.top) * canvas.height) / rect.height)
      return [...canvas.getContext('2d')!.getImageData(px, py, 1, 1).data]
    },
    { x, y },
  )

test('görsel görünürlüğü ve sahipliği katmanla birlikte değişir', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 760 })
  await page.goto('/')
  await addImage(page, '#ff0000', 'bottom.svg', 500, 380)

  await page.locator('button[title*="Katmanlar"], button[title*="Layers"]').click()
  await page.locator('button[title*="Yeni katman"], button[title*="New layer"]').click()
  await page.locator('button[title*="Kapat"], button[title*="Close"]').first().click()
  await addImage(page, '#00ff00', 'top.svg', 650, 400)

  const green = await pixelAt(page, 650, 400)
  expect(green[1]).toBeGreaterThan(180)
  expect(green[0]).toBeLessThan(80)
  const red = await pixelAt(page, 500, 380)
  expect(red[0]).toBeGreaterThan(180)
  expect(red[1]).toBeLessThan(80)

  await page.locator('button[title*="Katmanlar"], button[title*="Layers"]').click()
  const visibility = page.locator('[role="dialog"] input[type="checkbox"]')
  await visibility.nth(0).uncheck()
  await expect.poll(async () => (await pixelAt(page, 650, 400))[0]).toBeLessThan(60)
  await expect.poll(async () => (await pixelAt(page, 500, 380))[0]).toBeGreaterThan(180)
  await visibility.nth(1).uncheck()
  await expect.poll(async () => (await pixelAt(page, 500, 380))[0]).toBeLessThan(60)
  await expect.poll(async () => (await pixelAt(page, 500, 380))[1]).toBeLessThan(60)

  await visibility.nth(0).check()
  await visibility.nth(1).check()
  await page.locator('button[title*="Kapat"], button[title*="Close"]').first().click()
  await page.mouse.click(650, 400)
  await page.keyboard.press('Delete')
  await expect.poll(async () => (await pixelAt(page, 650, 400))[1]).toBeLessThan(60)
  await page.locator('button[title*="Katmanlar"], button[title*="Layers"]').click()
  await visibility.nth(0).uncheck()
  await visibility.nth(0).check()
  await expect.poll(async () => (await pixelAt(page, 650, 400))[1]).toBeLessThan(60)
})
