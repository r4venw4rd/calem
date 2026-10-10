import { test, expect, type Page } from '@playwright/test'

// E2E: silgi davranışı gerçek pointer event'leriyle (birim testin göremediği yer).
//
// Doğrulanan sözleşmeler:
//  1) Hızlı silgi önizlemesi (kâğıt rengi) NİHAİ görüntüdür → boş kâğıtta repaint
//     atlanmalı (`e`=0) ama şerit dışı bir piksel bile değişmemeli.
//  2) Önizleme nihai DEĞİLSE (metin var) repaint çalışmalı (`e`>0) ve görüntü yine doğru olmalı.
//  3) Bırakış kesimi tek geçişte ve ölçülür (`c`) olmalı.
//  4) Silme sürüklemesi tek undo hamlesi olmalı.
//
// Not: repaint atlama kararı burada gerçek GPU'suz (software raster) Chrome'da
// ölçülür; mutlak ms değerleri donanımı temsil etmez, sözleşmeler temsil eder.

type Rect = { x: number; y: number; w: number; h: number }

// Base canvas'ın (ilk canvas) cihaz-px geometrisi + boyanmış sayfa sınırları.
const canvasInfo = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.querySelectorAll('canvas')[0] as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const ctx = canvas.getContext('2d')!
    const { width, height } = canvas
    const img = ctx.getImageData(0, 0, width, height)
    let x0 = width
    let y0 = height
    let x1 = -1
    let y1 = -1
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (img.data[(y * width + x) * 4 + 3]! > 8) {
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
      }
    }
    return {
      width,
      height,
      scale: width / rect.width,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      bounds: { x0, y0, x1, y1 },
    }
  })

// Bölgenin ortalama parlaklığı (0-255, alfa ile ağırlıklı).
const meanLuma = (page: Page, r: Rect) =>
  page.evaluate((r) => {
    const canvas = document.querySelectorAll('canvas')[0] as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    const img = ctx.getImageData(r.x, r.y, r.w, r.h)
    let sum = 0
    for (let i = 0; i < img.data.length; i += 4) {
      const a = img.data[i + 3]! / 255
      sum += (img.data[i]! * 0.299 + img.data[i + 1]! * 0.587 + img.data[i + 2]! * 0.114) * a
    }
    return sum / (img.data.length / 4)
  }, r)

// HUD metni: "0.0/16ms e0.0 c0.4 · 4 strokes · 33+33" (reaktivite dışı DOM'a yazılır).
const hudText = (page: Page) =>
  page.evaluate(() => {
    for (const el of document.querySelectorAll('div')) {
      const t = el.textContent ?? ''
      if (/\d+(\.\d+)?\/\d+ms/.test(t) && t.length < 120) return t.trim()
    }
    return ''
  })

const parseHud = (hud: string) => ({
  eraseMs: Number(/ e([\d.]+)/.exec(hud)?.[1] ?? Number.NaN),
  cutMs: Number(/ c([\d.]+)/.exec(hud)?.[1] ?? Number.NaN),
  strokes: Number(/(\d+) strokes/.exec(hud)?.[1] ?? Number.NaN),
})

async function boot(page: Page) {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('/')
  const overlay = page.locator('canvas').nth(1)
  await expect(overlay).toBeVisible()

  let info = await canvasInfo(page)
  for (let i = 0; i < 50 && info.bounds.x1 < 0; i++) {
    await page.waitForTimeout(100)
    info = await canvasInfo(page)
  }
  expect(info.bounds.x1, 'sayfa render edildi').toBeGreaterThan(0)
  return { info, errors }
}

test('kes-silgi: boş kâğıtta önizleme nihaidir (repaint atlanır, şerit dışı değişmez)', async ({
  page,
}) => {
  const { info, errors } = await boot(page)
  const pb = info.bounds
  const w = pb.x1 - pb.x0
  const h = pb.y1 - pb.y0
  // Cihaz-px → ekran-px (DPR 1 olduğu için sadece rect ofseti).
  const sx = (x: number) => info.rect.left + x / info.scale
  const sy = (y: number) => info.rect.top + y / info.scale

  const rows = [0.32, 0.42, 0.52, 0.62].map((f) => Math.round(pb.y0 + h * f))
  const strokeX0 = Math.round(pb.x0 + w * 0.15)
  const strokeX1 = Math.round(pb.x0 + w * 0.85)
  const centerX = Math.round(pb.x0 + w * 0.5)

  const paper = await meanLuma(page, {
    x: Math.round(pb.x0 + w * 0.2),
    y: Math.round(pb.y0 + h * 0.08),
    w: Math.round(w * 0.6),
    h: Math.round(h * 0.05),
  })
  expect(paper, 'kâğıt boyandı').toBeGreaterThan(5)

  // 4 yatay çizgi (fare ile: gerçek pointer event'leri).
  for (const y of rows) {
    await page.mouse.move(sx(strokeX0), sy(y))
    await page.mouse.down()
    await page.mouse.move(sx(strokeX1), sy(y), { steps: 12 })
    await page.mouse.up()
  }
  await expect.poll(async () => parseHud(await hudText(page)).strokes).toBe(4)

  const refY = rows[1]!
  const inkLeft: Rect = {
    x: Math.round(pb.x0 + w * 0.2),
    y: refY - 6,
    w: Math.round(w * 0.1),
    h: 12,
  }
  const inkRight: Rect = {
    x: Math.round(pb.x0 + w * 0.7),
    y: refY - 6,
    w: Math.round(w * 0.1),
    h: 12,
  }
  const leftBefore = await meanLuma(page, inkLeft)
  const rightBefore = await meanLuma(page, inkRight)
  expect(leftBefore, 'sol segmentte mürekkep var').toBeGreaterThan(paper + 40)
  expect(rightBefore, 'sağ segmentte mürekkep var').toBeGreaterThan(paper + 40)

  // Silgi (kes modu) + sayfayı dikey kesen tek süpürme.
  await page.keyboard.press('e')
  await page.mouse.move(sx(centerX), sy(pb.y0 + h * 0.2))
  await page.mouse.down()
  await page.mouse.move(sx(centerX), sy(pb.y0 + h * 0.72), { steps: 24 })
  await page.mouse.up()

  // Her çizgi ikiye bölündü → 8 parça.
  await expect.poll(async () => parseHud(await hudText(page)).strokes).toBe(8)

  const hud = parseHud(await hudText(page))
  expect(hud.eraseMs, 'önizleme nihai → repaint atlandı').toBe(0)
  expect(hud.cutMs, 'bırakış kesimi ölçüldü').toBeGreaterThan(0)
  expect(hud.cutMs, 'tek-geçiş kesim makul sürede').toBeLessThan(60)

  // Şerit içi: mürekkep gitti, kâğıt seviyesine indi.
  // Ölçüm penceresi silinen bandın İÇİNDE kalmalı: silgi yarıçapı 12pt ≈ 13px
  // (bu görünümde), ±18px ölçmek kesilmemiş kenar sütunlarını da örnekler.
  const bandAfter = await meanLuma(page, { x: centerX - 8, y: refY - 4, w: 16, h: 8 })
  expect(Math.abs(bandAfter - paper), 'şeritte mürekkep artığı yok').toBeLessThan(4)

  // Şerit dışı: repaint atlandığı için hiçbir piksel değişmedi.
  const leftAfter = await meanLuma(page, inkLeft)
  const rightAfter = await meanLuma(page, inkRight)
  expect(Math.abs(leftAfter - leftBefore), 'şerit dışı sol bölge değişmedi').toBeLessThan(3)
  expect(Math.abs(rightAfter - rightBefore), 'şerit dışı sağ bölge değişmedi').toBeLessThan(3)

  // Silme sürüklemesi tek undo hamlesi.
  await page.keyboard.press('Control+z')
  await expect.poll(async () => parseHud(await hudText(page)).strokes).toBe(4)
  const leftUndone = await meanLuma(page, inkLeft)
  const bandUndone = await meanLuma(page, { x: centerX - 8, y: refY - 4, w: 16, h: 8 })
  expect(Math.abs(leftUndone - leftBefore), 'undo mürekkebi geri getirdi').toBeLessThan(3)
  expect(bandUndone, 'undo şeridi geri getirdi').toBeGreaterThan(paper + 20)

  expect(errors, 'konsol/sayfa hatası yok').toEqual([])
})

test('kes-silgi: önizleme nihai değilse (metin var) repaint çalışır ve görüntü doğru kalır', async ({
  page,
}) => {
  const { info, errors } = await boot(page)
  const pb = info.bounds
  const w = pb.x1 - pb.x0
  const h = pb.y1 - pb.y0
  const sx = (x: number) => info.rect.left + x / info.scale
  const sy = (y: number) => info.rect.top + y / info.scale

  const rows = [0.34, 0.6].map((f) => Math.round(pb.y0 + h * f))
  const strokeX0 = Math.round(pb.x0 + w * 0.15)
  const strokeX1 = Math.round(pb.x0 + w * 0.85)
  const centerX = Math.round(pb.x0 + w * 0.5)
  const textY = Math.round(pb.y0 + h * 0.45)

  const paper = await meanLuma(page, {
    x: Math.round(pb.x0 + w * 0.2),
    y: Math.round(pb.y0 + h * 0.05),
    w: Math.round(w * 0.6),
    h: Math.round(h * 0.04),
  })

  for (const y of rows) {
    await page.mouse.move(sx(strokeX0), sy(y))
    await page.mouse.down()
    await page.mouse.move(sx(strokeX1), sy(y), { steps: 12 })
    await page.mouse.up()
  }
  await expect.poll(async () => parseHud(await hudText(page)).strokes).toBe(2)

  // Metin kutusu: sayfanın ortasına, çizgilerin arasına.
  await page.keyboard.press('t')
  await page.mouse.click(sx(centerX - 60), sy(textY))
  const editor = page.locator('textarea')
  await expect(editor).toBeVisible()
  await editor.fill('HELLO HELLO HELLO')
  await page.keyboard.press('Escape')
  await expect(editor).toBeHidden()

  const textRect: Rect = { x: centerX - 60, y: textY, w: 260, h: 60 }
  const textBefore = await meanLuma(page, textRect)
  expect(textBefore, 'metin boyandı').toBeGreaterThan(paper + 6)

  // Süpürme hem çizgileri hem metni keser.
  await page.keyboard.press('e')
  await page.mouse.move(sx(centerX - 20), sy(pb.y0 + h * 0.25))
  await page.mouse.down()
  await page.mouse.move(sx(centerX - 20), sy(pb.y0 + h * 0.7), { steps: 24 })
  await page.mouse.up()

  await expect.poll(async () => parseHud(await hudText(page)).strokes).toBe(4)
  const hud = parseHud(await hudText(page))
  expect(hud.cutMs, 'bırakış kesimi ölçüldü').toBeGreaterThan(0)
  expect(hud.eraseMs, 'metin varken repaint ÇALIŞMALI (bayat değer değil)').toBeGreaterThan(0)

  const textAfter = await meanLuma(page, textRect)
  expect(Math.abs(textAfter - paper), 'metin silindi, zemin temiz').toBeLessThan(5)

  expect(errors, 'konsol/sayfa hatası yok').toEqual([])
})
