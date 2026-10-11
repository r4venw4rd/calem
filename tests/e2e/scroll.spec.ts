import { test, expect } from '@playwright/test'

test.describe('Kaydırmalı görünüm (Scroll Mode)', () => {
  test('hızlı sayfa ekleme + hemen yukarı: programatik kayış kullanıcı girdisini yenemez', async ({
    page,
  }) => {
    await page.goto('/')

    // Kaydırmalı modu aç
    await page.locator('button[title*="scroll view"], button[title*="kaydırma"]').first().click()
    await page.waitForTimeout(800)

    // Art arda sayfa ekle (4 sayfa, aktif en altta)
    const add = page.locator('button[title*="New page"], button[title*="Yeni sayfa"]').first()
    await add.click()
    await add.click()
    await add.click()
    await page.waitForTimeout(300)

    const counter = page.locator('[aria-label="Sayfalar"] span.font-mono')
    await expect(counter).toHaveText('4 / 4')

    const scrollTop = () =>
      page.evaluate(() => {
        const slot = [...document.querySelectorAll('div')].find(
          (d) => d.children.length === 2 && d.children[0].tagName === 'CANVAS',
        )
        const sc = slot?.parentElement as HTMLElement | null
        return sc ? sc.scrollTop : -1
      })

    // Yeni sayfaya inilmiş olmalı (en alt)
    const before = await scrollTop()
    expect(before).toBeGreaterThan(500)

    // Hemen yukarı: ilk tekerlek ANINDA yukarı kaydırmalı (smooth dövüşü yok)
    await page.mouse.move(640, 450)
    await page.mouse.wheel(0, -400)
    await page.waitForTimeout(150)
    const after = await scrollTop()
    expect(after).toBeLessThan(before)

    // Yukarı devam et: spy en görünür sayfayı aktifleştirir, görünümle eşleşir
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, -500)
      await page.waitForTimeout(120)
    }
    await page.waitForTimeout(1200)
    await expect(counter).toHaveText('1 / 4')
  })

  test('scroll modda zoom içeriği kaybetmez (canvas ortası opak kalır)', async ({ page }) => {
    await page.goto('/')
    await page.locator('button[title*="scroll view"], button[title*="kaydırma"]').first().click()
    await page.waitForTimeout(800)

    // Canlı slotun base canvas'ında merkez piksel opaklığı (0 = içerik ekran dışına boyanmış)
    const centerAlpha = () =>
      page.evaluate(() => {
        const slot = [...document.querySelectorAll('div')].find(
          (d) => d.children.length === 2 && d.children[0].tagName === 'CANVAS',
        ) as HTMLElement | undefined
        const base = slot?.children[0] as HTMLCanvasElement | undefined
        if (!base) return -1
        const r = base.getBoundingClientRect()
        if (r.width === 0) return -2
        const ctx = base.getContext('2d')
        const sx = Math.floor((base.width / r.width) * (r.width / 2))
        const sy = Math.floor((base.height / r.height) * (r.height / 2))
        return ctx?.getImageData(sx, sy, 1, 1).data[3] ?? -3
      })

    await page.mouse.move(640, 450)
    for (let i = 0; i < 4; i++) {
      await page.keyboard.down('Control')
      await page.mouse.wheel(0, -240)
      await page.keyboard.up('Control')
      await page.waitForTimeout(300)
      expect(await centerAlpha()).toBeGreaterThan(200)
    }
    for (let i = 0; i < 4; i++) {
      await page.keyboard.down('Control')
      await page.mouse.wheel(0, 240)
      await page.keyboard.up('Control')
      await page.waitForTimeout(300)
      expect(await centerAlpha()).toBeGreaterThan(200)
    }
  })

  test('scroll modda el-sürükleme native scroll yapar, boya-pan yapmaz', async ({ page }) => {
    await page.goto('/')
    await page.locator('button[title*="scroll view"], button[title*="kaydırma"]').first().click()
    await page.waitForTimeout(800)
    await page.locator('button[title*="New page"], button[title*="Yeni sayfa"]').first().click()
    await page.waitForTimeout(1000)

    const scrollTop = () =>
      page.evaluate(() => {
        const slot = [...document.querySelectorAll('div')].find(
          (d) => d.children.length === 2 && d.children[0].tagName === 'CANVAS',
        )
        const sc = slot?.parentElement as HTMLElement | null
        return sc ? sc.scrollTop : -1
      })
    const strokes = () =>
      page.evaluate(() => {
        const hud = [...document.querySelectorAll('div')].find((d) =>
          d.textContent?.includes('strokes'),
        )
        const m = /(\d+) strokes/.exec(hud?.textContent ?? '')
        return m ? Number(m[1]) : -1
      })

    // El aracını seç, aktif sayfa içinden aşağı sürükle
    await page.locator('button[title*="drag to pan"], button[title*="sürükle-kaydır"]').first().click()
    const before = await scrollTop()
    expect(before).toBeGreaterThan(200)
    await page.mouse.move(640, 400)
    await page.mouse.down()
    await page.mouse.move(640, 650, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(400)
    const after = await scrollTop()

    // Tut-sürükle: içerik fareyi takip eder (scrollTop ~250 azalır), mürekkep bulaşmaz
    expect(before - after).toBeGreaterThan(150)
    expect(await strokes()).toBe(0)
    await expect(page.locator('[aria-label="Sayfalar"] span.font-mono')).toHaveText('2 / 2')
  })

  test('pasif blok üzerinde ctrl+tekerlek app zoom yapar (tarayıcı-zoom yok)', async ({ page }) => {
    await page.goto('/')
    await page.locator('button[title*="scroll view"], button[title*="kaydırma"]').first().click()
    await page.waitForTimeout(800)
    await page.locator('button[title*="New page"], button[title*="Yeni sayfa"]').first().click()
    await page.waitForTimeout(1000)

    const state = () =>
      page.evaluate(() => {
        const nav = document.querySelector('[aria-label="Sayfalar"]')
        const zoom =
          nav?.querySelectorAll('button.font-mono')[2]?.textContent?.trim() ?? '?'
        const blocks = [...document.querySelectorAll('div[style*="aspect-ratio"]')] as HTMLElement[]
        return {
          zoom,
          widths: blocks.map((b) => b.offsetWidth),
        }
      })
    const before = await state()
    expect(before.widths[0]).toBeLessThan(900)

    // İmleç PASİF blok (sayfa 1) üzerindeyken ctrl+tekerlek (tek basışta tut)
    const pt = await page.evaluate(() => {
      const blocks = [...document.querySelectorAll('div[style*="aspect-ratio"]')] as HTMLElement[]
      const r = blocks[0]!.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: Math.max(120, r.top + 120) }
    })
    await page.mouse.move(pt.x, pt.y)
    await page.keyboard.down('Control')
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, -240)
      await page.waitForTimeout(250)
    }
    await page.keyboard.up('Control')
    await page.waitForTimeout(600)

    const after = await state()
    // App zoom çalıştı (bloklar büyüdü), aktif sayfa değişmedi
    expect(after.widths[0]).toBeGreaterThan(before.widths[0]! + 200)
    await expect(page.locator('[aria-label="Sayfalar"] span.font-mono')).toHaveText('2 / 2')
  })

  test('sayfa-arası zoomda imleç altındaki nokta sabit kalır', async ({ page }) => {
    await page.goto('/')
    await page.locator('button[title*="scroll view"], button[title*="kaydırma"]').first().click()
    await page.waitForTimeout(800)
    await page.locator('button[title*="New page"], button[title*="Yeni sayfa"]').first().click()
    await page.waitForTimeout(1000)

    // İmleci pasif blok içine koy, blok-içi oranı kaydet
    const cursorY = 450
    const before = await page.evaluate((cy) => {
      const blocks = [...document.querySelectorAll('div[style*="aspect-ratio"]')] as HTMLElement[]
      const b = blocks[0]!
      const r = b.getBoundingClientRect()
      return { frac: (cy - r.top) / r.height, top: r.top, h: r.height }
    }, cursorY)
    const blk = await page.evaluate(() => {
      const blocks = [...document.querySelectorAll('div[style*="aspect-ratio"]')] as HTMLElement[]
      const r = blocks[0]!.getBoundingClientRect()
      return { x: r.left + r.width / 2 }
    })
    await page.mouse.move(blk.x, cursorY)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -240)
    await page.mouse.wheel(0, -240)
    await page.keyboard.up('Control')
    await page.waitForTimeout(800)

    // Aynı layout noktası hâlâ imleç altında olmalı (±40px hoşgörü)
    const drift = await page.evaluate(
      ([cy, frac]) => {
        const blocks = [...document.querySelectorAll('div[style*="aspect-ratio"]')] as HTMLElement[]
        const b = blocks[0]!
        const r = b.getBoundingClientRect()
        return Math.abs(r.top + frac * r.height - cy)
      },
      [cursorY, before.frac] as const,
    )
    expect(drift).toBeLessThan(40)
  })

  test('dar ekranda zoom merkezli kalır ve sağ/sol yatay kaydırılabilir', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 900 })
    await page.goto('/')
    await page.locator('button[title*="scroll view"], button[title*="kaydırma"]').first().click()
    await page.waitForTimeout(800)

    const anchor = { x: 300, y: 450 }
    const before = await page.evaluate(({ x, y }) => {
      const block = [...document.querySelectorAll('div[style*="aspect-ratio"]')][0] as HTMLElement
      const box = document.querySelector('.overflow-y-auto') as HTMLElement
      const r = block.getBoundingClientRect()
      return { fracX: (x - r.left) / r.width, fracY: (y - r.top) / r.height, left: box.scrollLeft }
    }, anchor)

    await page.mouse.move(anchor.x, anchor.y)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -600)
    await page.keyboard.up('Control')
    await page.waitForTimeout(800)

    const after = await page.evaluate(({ x, y, fracX, fracY }) => {
      const block = [...document.querySelectorAll('div[style*="aspect-ratio"]')][0] as HTMLElement
      const box = document.querySelector('.overflow-y-auto') as HTMLElement
      const r = block.getBoundingClientRect()
      return {
        width: r.width,
        driftX: Math.abs(r.left + fracX * r.width - x),
        driftY: Math.abs(r.top + fracY * r.height - y),
        scrollLeft: box.scrollLeft,
        maxLeft: box.scrollWidth - box.clientWidth,
      }
    }, { ...anchor, fracX: before.fracX, fracY: before.fracY })

    expect(after.width).toBeGreaterThan(800)
    expect(after.scrollLeft).toBeGreaterThan(0)
    expect(after.maxLeft).toBeGreaterThan(0)
    expect(after.driftX).toBeLessThan(45)
    expect(after.driftY).toBeLessThan(45)
    const rightEdgeGap = await page.evaluate(() => {
      const block = [...document.querySelectorAll('div[style*="aspect-ratio"]')][0] as HTMLElement
      const box = document.querySelector('.overflow-y-auto') as HTMLElement
      box.scrollLeft = box.scrollWidth
      return Math.abs(block.getBoundingClientRect().right - box.getBoundingClientRect().right)
    })
    expect(rightEdgeGap).toBeLessThan(5)
  })
})
