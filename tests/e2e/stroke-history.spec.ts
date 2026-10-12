import { test, expect } from '@playwright/test'

const strokeCount = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const hud = [...document.querySelectorAll('div')].find((el) => el.textContent?.includes('strokes'))
    return Number(/(\d+) strokes/.exec(hud?.textContent ?? '')?.[1] ?? -1)
  })

test('stroke-add delta supports undo and redo', async ({ page }) => {
  await page.goto('/')
  const canvas = page.locator('canvas').nth(1)
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width * 0.3, box!.y + box!.height * 0.4)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width * 0.7, box!.y + box!.height * 0.6, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => strokeCount(page)).toBe(1)

  await page.keyboard.press('Control+z')
  await expect.poll(() => strokeCount(page)).toBe(0)
  await page.keyboard.press('Control+y')
  await expect.poll(() => strokeCount(page)).toBe(1)
})
