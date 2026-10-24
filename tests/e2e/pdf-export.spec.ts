import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'

// PDF export'un Unicode font gömme zinciri: public/fonts'taki subset TTF,
// tarayıcıdan gerçekten fetch edilip jsPDF'e gömülmeli (Identity-H kodlama).
// WinAnsi'de olmayan ı İ ğ ş gibi harfler bu sayede PDF'te bozulmadan kalır.

// File System Access API'yi etkisizleştir → savePdfBlob 'fallback' döner,
// jsPDF klasik <a download> indirmesi yapar (Firefox/WebKit'in gerçek yolu;
// deterministik test için Chromium'da da bu yol zorlanır).
const forceDownloadPath = (page: Page) =>
  page.addInitScript("Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })")

const openFileMenu = (page: Page) =>
  page.locator('button[title*="Dosya işlemleri"], button[title*="File operations"]').click()

test.describe('PDF Export', () => {
  test('Türkçe metin içeren sayfa, Unicode font gömülü PDF indirir', async ({ page }) => {
    await forceDownloadPath(page)
    await page.goto('/')

    // Türkçe harfler içeren bir metin oluştur ve işle.
    await page.locator('button[title*="Metin"], button[title*="Text"]').first().click()
    const overlay = page.locator('canvas').nth(1)
    const box = await overlay.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    const textarea = page.locator('textarea')
    await expect(textarea).toBeVisible()
    await textarea.fill('ığüşİÖÇ deneme — ışık')
    await page
      .getByRole('button', { name: /Tamam|Done/ })
      .first()
      .click()
    await expect(textarea).toBeHidden()

    // Export tetikle → klasik indirme yolu tetiklenmeli.
    await openFileMenu(page)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /PDF Yaz|Export PDF/ }).click(),
    ])

    // Dosya adı günlük damgalı calem-*.pdf
    expect(download.suggestedFilename()).toMatch(/^calem-\d{4}-\d{2}-\d{2}\.pdf$/)

    // İndirilen PDF: gömülü subset font (FontFile2 + Identity-H) görünmeli.
    // Metin içerikleri CID kodludur; font adı ve kodlama sözlüğü düz metindir.
    const bytes = readFileSync((await download.path())!)
    const pdf = bytes.toString('latin1')
    expect(pdf.startsWith('%PDF')).toBe(true)
    expect(pdf).toContain('NotoSans')
    expect(pdf).toContain('Identity-H')
  })
})
