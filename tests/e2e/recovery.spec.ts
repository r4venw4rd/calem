import { test, expect } from '@playwright/test'

test('autosaved ink is offered after reload', async ({ page }) => {
  await page.goto('/')

  const canvas = page.locator('canvas').nth(1)
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()

  await page.mouse.move(box!.x + box!.width * 0.3, box!.y + box!.height * 0.4)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width * 0.7, box!.y + box!.height * 0.6, { steps: 12 })
  await page.mouse.up()

  // Wait for the app's success indicator so the test never interferes with IDB upgrades.
  await page.getByRole('button', { name: 'File operations' }).click()
  await expect(page.getByText(/saved\s+\d/i)).toBeVisible()

  await page.reload()
  const recovery = page.getByRole('dialog', { name: /previous session|önceki oturum/i })
  await expect(recovery).toBeVisible()
  await expect(recovery).toContainText(/1 pages, 1 strokes|1 sayfa, 1 çizgi/i)
  await recovery.getByRole('button', { name: /restore|geri yükle/i }).click({ timeout: 5_000 })
  const replace = page.getByRole('dialog', { name: /current work|mevcut çalışma/i })
  if (await replace.isVisible().catch(() => false)) {
    await replace.getByRole('button', { name: /ok|tamam/i }).click()
  }
  await expect(recovery).toBeHidden()
})
