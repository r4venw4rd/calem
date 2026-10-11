import { test, expect } from '@playwright/test'

test.describe('Mobil palet (MobileOptionsSheet)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('custom renk satırı: damlalık + boş slotta "+" görünür', async ({ page }) => {
    await page.goto('/')

    // Mobil alt bardaki palet düğmesiyle sheet'i aç
    await page.locator('button[title*="palette" i]').first().click()
    const sheet = page.locator('[aria-label*="palette" i]')
    await expect(sheet).toBeVisible()

    // Damlalık (renk girdisi) ve ilk boş slottaki "+" düğmesi
    await expect(sheet.locator('input[type="color"]')).toBeVisible()
    await expect(
      sheet.locator('button[title*="Open color picker"], button[title*="Renk seçici"]'),
    ).toBeVisible()
  })
})
