import { test, expect, type Page } from '@playwright/test'

// E2E: seçim aracı köşe tutamacıyla ölçekleme + zoom sonrası seçim kutusunun
// kalıcılığı. Jest gerçek pointer olaylarıyla sürülür; store yalnızca tohum
// (deterministik stroke), tutamaç konumu ve okunan geometri için kullanılır
// (vite dev sunucusu /src modüllerini servis eder).

async function boot(page: Page) {
  await page.goto('/')
  await expect(page.locator('canvas').nth(1)).toBeVisible()
  await page.waitForTimeout(1200)
  await page.evaluate(async () => {
    const s = await import('/src/stores/drawing.ts')
    const p = await import('/node_modules/.vite/deps/pinia.js')
    const store = s.useDrawingStore(p.getActivePinia())
    const layer = store.pages[0].layers[0]
    layer.strokes.length = 0
    layer.strokes.push({
      id: 'seed',
      tool: 'pen',
      color: '#111',
      width: 4,
      dash: 'solid',
      opacity: 1,
      points: [
        { x: 200, y: 200, pressure: 0.5 },
        { x: 400, y: 300, pressure: 0.5 },
      ],
    })
    store.repaintBase()
    store.currentTool = 'select'
    store.selectedIds = ['seed']
  })
  await page.waitForTimeout(250)
}

// SE tutamacının ekran koordinatı (padded seçim bbox köşesi → view dönüşümü).
const seHandle = (page: Page) =>
  page.evaluate(async () => {
    const s = await import('/src/stores/drawing.ts')
    const p = await import('/node_modules/.vite/deps/pinia.js')
    const store = s.useDrawingStore(p.getActivePinia())
    const st = store.pages[0].layers[0].strokes[0]
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const pt of st.points) {
      x0 = Math.min(x0, pt.x)
      y0 = Math.min(y0, pt.y)
      x1 = Math.max(x1, pt.x)
      y1 = Math.max(y1, pt.y)
    }
    const pad = Math.max(st.width / 2, 2)
    const t = store.getViewTransform()
    const r = document.querySelectorAll('canvas')[1].getBoundingClientRect()
    return { x: r.left + (x1 + pad) * t.scale + t.ox, y: r.top + (y1 + pad) * t.scale + t.oy }
  })

const geometry = (page: Page) =>
  page.evaluate(async () => {
    const s = await import('/src/stores/drawing.ts')
    const p = await import('/node_modules/.vite/deps/pinia.js')
    const store = s.useDrawingStore(p.getActivePinia())
    const st = store.pages[0].layers[0].strokes[0]
    return {
      pts: st.points.map((pt) => ({ x: pt.x, y: pt.y })),
      width: st.width,
      sel: store.selectionCount,
    }
  })

const overlayInk = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelectorAll('canvas')[1] as HTMLCanvasElement
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++
    return n
  })

test('seçim köşe tutamacıyla ölçeklenir; undo geometriyi geri getirir', async ({ page }) => {
  await boot(page)
  const before = await geometry(page)
  const handle = await seHandle(page)

  // SE tutamacından dışa doğru çapraz sürükle.
  await page.mouse.move(handle.x, handle.y)
  await page.mouse.down()
  await page.mouse.move(handle.x + 120, handle.y + 120, { steps: 20 })
  await page.mouse.up()
  await page.waitForTimeout(300)

  const after = await geometry(page)
  expect(after.sel, 'seçim korunur').toBe(1)
  expect(Math.abs(after.pts[0]!.x - before.pts[0]!.x), 'anchor köşesi sabit (x)').toBeLessThan(5)
  expect(Math.abs(after.pts[0]!.y - before.pts[0]!.y), 'anchor köşesi sabit (y)').toBeLessThan(5)
  expect(after.pts[1]!.x, 'sağ-alt köşe dışa taşındı (x)').toBeGreaterThan(before.pts[1]!.x + 50)
  expect(after.pts[1]!.y, 'sağ-alt köşe dışa taşındı (y)').toBeGreaterThan(before.pts[1]!.y + 50)
  expect(after.width, 'çizgi kalınlığı ölçekle büyüdü').toBeGreaterThan(before.width)

  await page.keyboard.press('Control+z')
  await page.waitForTimeout(300)
  const undone = await geometry(page)
  expect(undone.pts[1]!.x, 'undo x geri getirdi').toBeCloseTo(before.pts[1]!.x, 0)
  expect(undone.pts[1]!.y, 'undo y geri getirdi').toBeCloseTo(before.pts[1]!.y, 0)
  expect(undone.width, 'undo kalınlığı geri getirdi').toBeCloseTo(before.width, 1)
})

test('zoom seçim kutusunu silmez (overlay tazelenir)', async ({ page }) => {
  await boot(page)
  const before = await overlayInk(page)
  expect(before, 'seçim kutusu çizildi').toBeGreaterThan(0)

  await page.mouse.move(640, 400)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -240)
  await page.mouse.wheel(0, -240)
  await page.keyboard.up('Control')
  await page.waitForTimeout(600)

  const after = await overlayInk(page)
  expect(after, 'zoom sonrası seçim kutusu hâlâ görünür').toBeGreaterThan(0)
})
