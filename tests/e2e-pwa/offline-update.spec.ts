import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test, expect } from '@playwright/test'

test('keeps autosaved work through a service worker update and offline restart', async ({
  page,
  context,
}) => {
  let mainNavigations = 0
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) mainNavigations += 1
  })
  await page.addInitScript(() => {
    navigator.serviceWorker?.addEventListener('controllerchange', () => {
      sessionStorage.setItem('calem-controller-changed', 'yes')
    })
  })
  await page.goto('/')
  await expect.poll(() => mainNavigations).toBeGreaterThan(1)
  await page.waitForLoadState('networkidle')
  const canvas = page.locator('canvas').nth(1)
  await expect(canvas).toBeVisible()
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width * 0.3, box!.y + box!.height * 0.4)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width * 0.7, box!.y + box!.height * 0.6, { steps: 12 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'File operations' }).click()
  await expect(page.getByText(/saved\s+\d/i)).toBeVisible()

  const swPath = resolve(process.cwd(), 'dist/service-worker.js')
  const originalScript = await readFile(swPath, 'utf8')
  const updatedScript = originalScript.replace('calem-v3', 'calem-v4')
  expect(updatedScript).not.toBe(originalScript)
  try {
    await writeFile(swPath, updatedScript)
    await page.evaluate(() => sessionStorage.removeItem('calem-controller-changed'))
    const reloaded = page.waitForNavigation({ waitUntil: 'load' })
    await page.evaluate(() => {
      void navigator.serviceWorker.getRegistration().then((registration) => {
        if (!registration) throw new Error('service worker registration missing')
        return registration.update()
      })
    })
    await reloaded
    expect(await page.evaluate(() => sessionStorage.getItem('calem-controller-changed'))).toBe('yes')
    const recovery = page.getByRole('dialog', { name: /previous session|önceki oturum/i })
    await expect(recovery).toBeVisible()
    await expect(recovery).toContainText(/1 pages, 1 strokes|1 sayfa, 1 çizgi/i)
    await recovery.getByRole('button', { name: /restore|geri yükle/i }).click()
    await expect(recovery).toBeHidden()

    await context.setOffline(true)
    await page.reload()
    await expect(page.locator('canvas').nth(1)).toBeVisible()
  } finally {
    await writeFile(swPath, originalScript)
  }
})
