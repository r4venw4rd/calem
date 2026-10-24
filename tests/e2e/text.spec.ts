import { test, expect } from '@playwright/test'

test.describe('Metin Aracı (Text Tool)', () => {
  test('Canvas üzerine tıklayınca Paint tarzı metin alanı ve alt kontrol çubuğu açılır', async ({ page }) => {
    await page.goto('/')

    // Text aracını seç
    const textToolBtn = page.locator('button[title*="Metin"], button[title*="Text"]').first()
    await textToolBtn.click()

    // Overlay canvas üzerine tıkla (sayfa ortasına yakın)
    const overlay = page.locator('canvas').nth(1)
    const box = await overlay.boundingBox()
    expect(box).not.toBeNull()

    const clickX = box!.x + box!.width / 2
    const clickY = box!.y + box!.height / 2

    await page.mouse.click(clickX, clickY)

    // Inline textarea görünür olmalı
    const textarea = page.locator('textarea')
    await expect(textarea).toBeVisible()
    await expect(textarea).toBeFocused()

    // Textarea konumu tıklanan noktanın yakınına konumlanmalı ve üst header'ın (y < 72) altında kalmamalı
    const textareaBox = await textarea.boundingBox()
    expect(textareaBox).not.toBeNull()
    expect(textareaBox!.y).toBeGreaterThanOrEqual(72)

    // Altındaki kayan kontrol çubuğu görünür olmalı (Tamam, Sil, vb.)
    const doneBtn = page.getByRole('button', { name: /Tamam|Done/i }).first()
    await expect(doneBtn).toBeVisible()

    // Yazı yazma testi
    await textarea.fill('Merhaba Calem!')
    expect(await textarea.inputValue()).toBe('Merhaba Calem!')

    // Tamam düğmesine basarak editörü kapat
    await doneBtn.click()
    await expect(textarea).toBeHidden()
  })

  test('Metin editörü açıkken başka bir yere tıklanınca önceki metin kaydedilir ve kapatılır', async ({ page }) => {
    await page.goto('/')

    const textToolBtn = page.locator('button[title*="Metin"], button[title*="Text"]').first()
    await textToolBtn.click()

    const overlay = page.locator('canvas').nth(1)
    const box = await overlay.boundingBox()
    expect(box).not.toBeNull()

    // Birinci noktaya tıkla ve yaz
    const firstX = box!.x + box!.width / 3
    const firstY = box!.y + box!.height / 3
    await page.mouse.click(firstX, firstY)

    const textarea = page.locator('textarea')
    await expect(textarea).toBeVisible()
    await textarea.fill('İlk Metin')

    // Başka bir noktaya tıkla
    const secondX = box!.x + (box!.width * 2) / 3
    const secondY = box!.y + (box!.height * 2) / 3
    await page.mouse.click(secondX, secondY)

    // Yeni metin kutusu açılmış olmalı (veya boş tıklama ise yeni kutu başlar)
    await expect(textarea).toBeVisible()
    expect(await textarea.inputValue()).toBe('')
  })

  test('Editör yazı boyutu 12px tabanına basılmaz — canvas ölçeğini birebir izler', async ({ page }) => {
    await page.goto('/')

    const textToolBtn = page.locator('button[title*="Metin"], button[title*="Text"]').first()
    await textToolBtn.click()
    const overlay = page.locator('canvas').nth(1)
    const box = await overlay.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)

    const textarea = page.locator('textarea')
    await expect(textarea).toBeVisible()

    // Boyutu slaytın tabanına çek (SLIDERS.textSize.min = 8): eski kod
    // max(12, round(size×zoom)) yüzünden küçük yazıyı 12px'e şişirip commit'te
    // küçültüyordu. Artık görünen = canvas'taki işlenmiş boyut.
    const slider = page
      .locator('input[type="range"][title*="Yazı boyu"], input[type="range"][title*="Font size"]')
      .first()
    await slider.evaluate((el, v) => {
      el.value = String(v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, 8)

    const px = await textarea.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    expect(px).toBeLessThan(12)
  })
})
