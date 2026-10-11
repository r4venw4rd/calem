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
})
