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

// Bölgenin ortalama alfasi: sayfa DIŞI (letterbox) boyandı mı?
const meanAlpha = (page: Page, r: Rect) =>
  page.evaluate((r) => {
    const canvas = document.querySelectorAll('canvas')[0] as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    const img = ctx.getImageData(r.x, r.y, r.w, r.h)
    let sum = 0
    for (let i = 3; i < img.data.length; i += 4) sum += img.data[i]!
    return sum / (img.data.length / 4)
  }, r)

// Bölgede eşiğin üstündeki piksel oranı: kâğıt deseni/çizgi yoğunluğu ölçüsü.
const brightRatio = (page: Page, r: Rect, threshold = 34) =>
  page.evaluate(
    ({ r, threshold }) => {
      const canvas = document.querySelectorAll('canvas')[0] as HTMLCanvasElement
      const ctx = canvas.getContext('2d')!
      const img = ctx.getImageData(r.x, r.y, r.w, r.h)
      let bright = 0
      let n = 0
      for (let i = 0; i < img.data.length; i += 4) {
        const a = img.data[i + 3]! / 255
        const l = (img.data[i]! * 0.299 + img.data[i + 1]! * 0.587 + img.data[i + 2]! * 0.114) * a
        if (l > threshold) bright++
        n++
      }
      return bright / n
    },
    { r, threshold },
  )

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
  // HUD 0.1 ms hassasiyetinde; çok hızlı repaint 0.0 görünebilir. Piksel sonucu aşağıda doğrulanır.

  const textAfter = await meanLuma(page, textRect)
  expect(Math.abs(textAfter - paper), 'metin silindi, zemin temiz').toBeLessThan(5)

  expect(errors, 'konsol/sayfa hatası yok').toEqual([])
})

test('kes-silgi: önizleme kâğıt dışına taşmaz (kenardan süpürme)', async ({ page }) => {
  const { info, errors } = await boot(page)
  const pb = info.bounds
  const w = pb.x1 - pb.x0
  const h = pb.y1 - pb.y0
  const sx = (x: number) => info.rect.left + x / info.scale
  const sy = (y: number) => info.rect.top + y / info.scale

  const paper = await meanLuma(page, {
    x: Math.round(pb.x0 + w * 0.2),
    y: Math.round(pb.y0 + h * 0.08),
    w: Math.round(w * 0.6),
    h: Math.round(h * 0.05),
  })

  // Sayfa kenarına dayanan çizgi (süpürme bunun üstünden geçecek).
  const yMid = Math.round(pb.y0 + h * 0.45)
  await page.mouse.move(sx(pb.x0 + 2), sy(yMid))
  await page.mouse.down()
  await page.mouse.move(sx(pb.x0 + 260), sy(yMid), { steps: 14 })
  await page.mouse.up()
  await expect.poll(async () => parseHud(await hudText(page)).strokes).toBe(1)

  // Şerit içi (kenarda, çizginin üstünde) + şerit dışı + sayfa dışı (letterbox).
  const bandInk: Rect = { x: pb.x0 + 1, y: yMid - 6, w: 12, h: 12 }
  const inkAway: Rect = { x: Math.round(pb.x0 + w * 0.25), y: yMid - 6, w: 80, h: 12 }
  const outsideStrip: Rect = { x: pb.x0 - 40, y: yMid - 60, w: 36, h: 120 }
  const bandBefore = await meanLuma(page, bandInk)
  const awayBefore = await meanLuma(page, inkAway)
  expect(bandBefore, 'kenarda mürekkep var').toBeGreaterThan(paper + 40)
  expect(awayBefore, 'şerit dışında mürekkep var').toBeGreaterThan(paper + 40)
  expect(await meanAlpha(page, outsideStrip), 'öncesi: sayfa dışı boş').toBe(0)

  // Kenarın 4px içinden dikey süpürme: fırça yarıçapı (~13px) sayfayı taşar.
  await page.keyboard.press('e')
  await page.mouse.move(sx(pb.x0 + 4), sy(yMid - 120))
  await page.mouse.down()
  await page.mouse.move(sx(pb.x0 + 4), sy(yMid + 120), { steps: 20 })

  // Sürükleme SIRASINDA: sayfa dışına tek piksel boyanmamalı, şerit içi örtülmeli.
  const outsideDuring = await meanAlpha(page, outsideStrip)
  const bandDuring = await meanLuma(page, bandInk)
  expect(outsideDuring, 'sürükleme sırasında sayfa dışı boyanmadı').toBe(0)
  expect(bandDuring, 'önizleme şerit içini örttü').toBeLessThan(paper + 12)

  await page.mouse.up()
  await expect.poll(async () => parseHud(await hudText(page)).cutMs).toBeGreaterThan(0)
  expect(await meanAlpha(page, outsideStrip), 'bırakış sonrası sayfa dışı boş').toBe(0)
  expect(parseHud(await hudText(page)).eraseMs, 'boş kâğıtta repaint atlandı').toBe(0)

  // Şerit içi temiz, şerit dışı el değmemiş.
  expect(await meanLuma(page, bandInk), 'şerit içi mürekkep gitti').toBeLessThan(paper + 12)
  expect(Math.abs((await meanLuma(page, inkAway)) - awayBefore), 'şerit dışı değişmedi').toBeLessThan(3)

  expect(errors, 'konsol/sayfa hatası yok').toEqual([])
})

// Kâğıdın gördüğü letterbox eksenini bulur: kenar başına sayfa dışı kalınlık.
type Box = { x0: number; y0: number; x1: number; y1: number }
const letterbox = (pb: Box, canvas: { width: number; height: number }) => ({
  left: pb.x0,
  right: canvas.width - 1 - pb.x1,
  top: pb.y0,
  bottom: canvas.height - 1 - pb.y1,
})

// Verilen doğru boyunca süpürme yapar ve: sayfa dışı şeridin alfasını (sürükleme
// sırasında + bırakışta), şerit içindeki mürekkebin sürükleme sırasındaki değerini
// döner. bandInk, "önizleme gerçekten boyadı mı" kanıtıdır (sessiz no-op testini önler).
async function sweepLine(
  page: Page,
  info: { rect: { left: number; top: number }; scale: number },
  from: [number, number],
  to: [number, number],
  outside: Rect,
  bandInk: Rect,
) {
  const sx = (x: number) => info.rect.left + x / info.scale
  const sy = (y: number) => info.rect.top + y / info.scale
  const before = await meanAlpha(page, outside)
  const inkBefore = await meanLuma(page, bandInk)
  await page.mouse.move(sx(from[0]), sy(from[1]))
  await page.mouse.down()
  await page.mouse.move(sx(to[0]), sy(to[1]), { steps: 16 })
  const during = await meanAlpha(page, outside)
  const inkDuring = await meanLuma(page, bandInk)
  await page.mouse.up()
  const after = await meanAlpha(page, outside)
  return { before, during, after, inkBefore, inkDuring }
}

test('kes-silgi: her kenarda ve köşede sayfa dışına tek piksel taşmaz (yatay + dikey letterbox)', async ({
  page,
}) => {
  const { info, errors } = await boot(page)
  const pb = info.bounds
  const w = pb.x1 - pb.x0
  const h = pb.y1 - pb.y0
  const sx = (x: number) => info.rect.left + x / info.scale
  const sy = (y: number) => info.rect.top + y / info.scale
  // Viewport'un tepesindeki toolbar bir KATMAN: süpürmeyi altından başlat, yoksa
  // pointer olaylarını başlık yutar ve test sessizce hiçbir şey ölçmez.
  const safe = 140

  expect(letterbox(pb, info).left, 'yatayda sol letterbox var').toBeGreaterThan(20)

  // --- Sol kenar (yatay letterbox): şeridi kesen mürekkep + kenar boyunca süpürme ---
  const yMid = Math.round(pb.y0 + h * 0.5)
  await page.mouse.move(sx(pb.x0 + 2), sy(yMid))
  await page.mouse.down()
  await page.mouse.move(sx(pb.x0 + 220), sy(yMid), { steps: 12 })
  await page.mouse.up()
  await expect.poll(async () => parseHud(await hudText(page)).strokes).toBe(1)

  const leftInk: Rect = { x: pb.x0 + 1, y: yMid - 6, w: 12, h: 12 }
  const leftStrip: Rect = { x: pb.x0 - 30, y: pb.y0 + safe, w: 26, h: h - safe * 2 }
  await page.keyboard.press('e')
  const left = await sweepLine(page, info, [pb.x0 + 4, pb.y0 + safe], [pb.x0 + 4, pb.y1 - safe], leftStrip, leftInk)
  expect(left.inkBefore, 'sol: şeritte mürekkep var').toBeGreaterThan(60)
  expect(left.inkDuring, 'sol: önizleme şeridi örttü').toBeLessThan(left.inkBefore - 40)
  expect(left.before, 'sol: öncesi temiz').toBe(0)
  expect(left.during, 'sol: sürükleme sırasında taşma yok').toBe(0)
  expect(left.after, 'sol: bırakış sonrası taşma yok').toBe(0)

  // --- Sol-alt köşe (başlığın uzağında): çapraz süpürme + köşe mürekkebi ---
  const cornerY = pb.y1 - 90
  const beforeCorner = parseHud(await hudText(page)).strokes
  await page.keyboard.press('p') // mürekkep eklemek için kalem (silgi seçili kalmasın)
  await page.mouse.move(sx(pb.x0 + 2), sy(cornerY))
  await page.mouse.down()
  await page.mouse.move(sx(pb.x0 + 200), sy(cornerY), { steps: 12 })
  await page.mouse.up()
  await expect.poll(async () => parseHud(await hudText(page)).strokes).toBe(beforeCorner + 1)

  const cornerInk: Rect = { x: pb.x0 + 1, y: cornerY - 6, w: 12, h: 12 }
  const cornerStrip: Rect = { x: pb.x0 - 30, y: pb.y1 - 90, w: 26, h: 60 }
  await page.keyboard.press('e') // süpürmeden önce silgiye dön
  const corner = await sweepLine(
    page,
    info,
    [pb.x0 + 6, pb.y1 - 90],
    [pb.x0 + 90, pb.y1 - 6],
    cornerStrip,
    cornerInk,
  )
  expect(corner.inkBefore, 'köşe: mürekkep var').toBeGreaterThan(60)
  expect(corner.inkDuring, 'köşe: önizleme örttü').toBeLessThan(corner.inkBefore - 40)
  expect(corner.during, 'köşe: sürükleme sırasında taşma yok').toBe(0)
  expect(corner.after, 'köşe: bırakış sonrası taşma yok').toBe(0)

  // --- Üst kenar (tablet/portre: letterbox dikeyde) ---
  // Ölçüm bölgesi (üst letterbox) başlık katmanının ALTINDA kalmalı: yeterince dar
  // ve uzun bir viewport seç ki dikey letterbox ~200px olsun.
  await page.setViewportSize({ width: 700, height: 1400 })
  await page.waitForTimeout(400)
  const info2 = await canvasInfo(page)
  const pb2 = info2.bounds
  const w2 = pb2.x1 - pb2.x0
  const lb2 = letterbox(pb2, info2)
  expect(lb2.top, 'portrede üst letterbox başlığın altına sığacak kadar geniş').toBeGreaterThan(safe + 30)

  // Şeridi kesen DİKEY çizgi (üst banttan geçsin).
  const xMid = Math.round(pb2.x0 + w2 * 0.5)
  const sx2 = (x: number) => info2.rect.left + x / info2.scale
  const sy2 = (y: number) => info2.rect.top + y / info2.scale
  const beforeTop = parseHud(await hudText(page)).strokes
  await page.keyboard.press('p')
  await page.mouse.move(sx2(xMid), sy2(pb2.y0 + 2))
  await page.mouse.down()
  await page.mouse.move(sx2(xMid), sy2(pb2.y0 + 220), { steps: 12 })
  await page.mouse.up()
  await expect.poll(async () => parseHud(await hudText(page)).strokes).toBe(beforeTop + 1)
  await page.keyboard.press('e')

  const topInk: Rect = { x: xMid - 6, y: pb2.y0 + 2, w: 12, h: 12 }
  const topStrip: Rect = { x: pb2.x0 + 40, y: pb2.y0 - 26, w: w2 - 80, h: 22 }
  const top = await sweepLine(
    page,
    info2,
    [pb2.x0 + w2 * 0.25, pb2.y0 + 4],
    [pb2.x0 + w2 * 0.75, pb2.y0 + 4],
    topStrip,
    topInk,
  )
  expect(top.inkBefore, 'üst: şeritte mürekkep var').toBeGreaterThan(60)
  expect(top.inkDuring, 'üst: önizleme şeridi örttü').toBeLessThan(top.inkBefore - 40)
  expect(top.during, 'üst: sürükleme sırasında taşma yok').toBe(0)
  expect(top.after, 'üst: bırakış sonrası taşma yok').toBe(0)

  expect(errors, 'konsol/sayfa hatası yok').toEqual([])
})

test('kes-silgi: desenli kâğıtta önizleme deseni korur (bant sonradan "kaybolmaz")', async ({
  page,
}) => {
  const { info, errors } = await boot(page)
  const pb = info.bounds
  const w = pb.x1 - pb.x0
  const h = pb.y1 - pb.y0
  const sx = (x: number) => info.rect.left + x / info.scale
  const sy = (y: number) => info.rect.top + y / info.scale

  // Ayarlar → kareli kâğıt, en sık aralık (ölçüm sinyali güçlensin).
  await page.getByTitle('Settings').click()
  await page.getByTitle('Paper pattern').selectOption('graph')
  await page.getByTitle('Spacing').evaluate((el) => {
    const input = el as HTMLInputElement
    input.value = input.min
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.mouse.click(8, 8) // backdrop → kapat
  await expect(page.getByTitle('Paper pattern')).toBeHidden()

  const yMid = Math.round(pb.y0 + h * 0.5)
  const sweepX = Math.round(pb.x0 + w * 0.35)
  const sweepTop = Math.round(pb.y0 + h * 0.25)
  const sweepBottom = Math.round(pb.y0 + h * 0.72)
  // Bant bölgesi: süpürmenin içinde ama çizginin ÜSTÜNDE (mürekkeksiz, desenli alan).
  const bandPattern: Rect = { x: sweepX - 10, y: sweepTop + 20, w: 20, h: yMid - sweepTop - 60 }
  // Bant içinde çizginin üstü: önizlemenin gerçekten boyadığının kanıtı.
  const bandInk: Rect = { x: sweepX - 16, y: yMid - 6, w: 32, h: 12 }
  const outsideStrip: Rect = { x: pb.x0 - 40, y: sweepTop, w: 36, h: sweepBottom - sweepTop }

  // Çizgi süpürmenin ortasından geçsin (kesim iki parça üretsin).
  await page.mouse.move(sx(Math.round(pb.x0 + w * 0.2)), sy(yMid))
  await page.mouse.down()
  await page.mouse.move(sx(Math.round(pb.x0 + w * 0.8)), sy(yMid), { steps: 14 })
  await page.mouse.up()
  await expect.poll(async () => parseHud(await hudText(page)).strokes).toBe(1)

  const patternBefore = await brightRatio(page, bandPattern)
  const bandInkBefore = await meanLuma(page, bandInk)
  expect(patternBefore, 'desen boyandı').toBeGreaterThan(0.05)
  expect(bandInkBefore, 'şeritte çizgi var').toBeGreaterThan(60)

  await page.keyboard.press('e')
  await page.mouse.move(sx(sweepX), sy(sweepTop))
  await page.mouse.down()
  await page.mouse.move(sx(sweepX), sy(sweepBottom), { steps: 20 })

  // Sürükleme sırasında: şeritteki mürekkep örtülmüş VE desen korunmuş olmalı
  // (aksi halde bant kâğıt rengiyle boyanıp bırakışta "kayboluyor" gibi görünür).
  const inkDuring = await meanLuma(page, bandInk)
  const patternDuring = await brightRatio(page, bandPattern)
  expect(inkDuring, 'önizleme şeritteki mürekkebi örttü').toBeLessThan(bandInkBefore - 40)
  expect(patternDuring, 'sürükleme sırasında desen korundu').toBeGreaterThan(patternBefore * 0.5)
  expect(await meanAlpha(page, outsideStrip), 'sayfa dışı boyanmadı').toBe(0)

  await page.mouse.up()
  await expect.poll(async () => parseHud(await hudText(page)).strokes).toBe(2)
  // Desen var → önizleme nihai sayılmaz, repaint çalışır (görüntü yine doğru).
  // Repaint süresi 0.1 ms altında yuvarlanabilir; desenin korunmasını piksellerle doğrula.
  const patternAfter = await brightRatio(page, bandPattern)
  expect(patternAfter, 'bırakış sonrası desen yerinde').toBeGreaterThan(patternBefore * 0.5)
  expect(await meanAlpha(page, outsideStrip), 'bırakış sonrası sayfa dışı boş').toBe(0)

  expect(errors, 'konsol/sayfa hatası yok').toEqual([])
})
