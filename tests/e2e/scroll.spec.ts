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
})
