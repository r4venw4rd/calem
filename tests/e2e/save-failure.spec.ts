import { test, expect } from '@playwright/test'

test('a failed autosave is reported and leaves the last saved document intact', async ({ page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if ((window as Window & { __failIdbWrites?: boolean }).__failIdbWrites) {
        throw new DOMException('Simulated storage quota error', 'QuotaExceededError')
      }
      return put.apply(this, args)
    }
  })
  await page.goto('/')

  const canvas = page.locator('canvas').nth(1)
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  const draw = async (y: number) => {
    await page.mouse.move(box!.x + box!.width * 0.3, box!.y + box!.height * y)
    await page.mouse.down()
    await page.mouse.move(box!.x + box!.width * 0.7, box!.y + box!.height * y, { steps: 8 })
    await page.mouse.up()
  }

  await draw(0.4)
  const readStrokeCount = () =>
    page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('calem')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      return new Promise<number>((resolve, reject) => {
        const req = db.transaction('docs').objectStore('docs').get('default')
        req.onsuccess = () =>
          resolve(
            req.result?.pages?.[0]?.layers?.reduce(
              (n: number, layer: { strokes: unknown[] }) => n + layer.strokes.length,
              0,
            ) ?? 0,
          )
        req.onerror = () => reject(req.error)
      })
    })

  await expect.poll(readStrokeCount).toBe(1)
  await page.evaluate(() => {
    ;(window as Window & { __failIdbWrites?: boolean }).__failIdbWrites = true
  })
  await draw(0.6)

  await page.getByRole('button', { name: 'File operations' }).click()
  await expect(page.getByText('Autosave failed; changes are not saved')).toBeVisible()
  await expect.poll(readStrokeCount).toBe(1)
})
