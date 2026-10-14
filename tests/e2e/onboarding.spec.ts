import { test, expect } from '@playwright/test'

// Onboarding ilk açılışta görünür: bu spec bilerek "ilk kez açan kullanıcı" state'iyle
// çalışır (kök config'teki `calem-onboarded` tohumu devre dışı bırakılır).
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('İlk açılış onboarding', () => {
  test('welcome → cihaz profili → kurulum akışı tamamlanır ve bayrak yazılır', async ({ page }) => {
    await page.goto('/')

    // Adım 0: karşılama + kalem vurgusu
    const dialog = page.locator('[role="dialog"][aria-modal="true"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Welcome to Calem')).toBeVisible()

    // Adım 1: cihaz profili
    await dialog.getByRole('button', { name: 'Get started' }).click()
    await expect(dialog.getByText('How will you use Calem?')).toBeVisible()
    await dialog.getByRole('radio', { name: /Stylus \+ touchscreen PC/ }).click()

    // Adım 2: kurulum teşviği
    await dialog.getByRole('button', { name: 'Next' }).click()
    await expect(dialog.getByText('Install as app')).toBeVisible()

    // Bitir → overlay kapanır, bayrak yazılır
    await dialog.getByRole('button', { name: 'Start drawing' }).click()
    await expect(dialog).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('calem-onboarded'))).toBe('1')

    // Profil girdi varsayılanları uygulanmış: avuç reddi + dokunmayla kaydırma açık
    await page.locator('button[title="Settings"]').click()
    const palm = page.locator('label[title="When on, touch drawing is blocked"] input')
    const touchPan = page.locator('label[title="When on, finger pans in every tool, pen/mouse draws"] input')
    await expect(palm).toBeChecked()
    await expect(touchPan).toBeChecked()
    // Parmak jestleri varsayılan kapalı
    await expect(page.locator('label[title="When on, a quick two-finger tap undoes"] input')).not.toBeChecked()
    await expect(page.locator('label[title="When on, a quick three-finger tap redoes"] input')).not.toBeChecked()
  })

  test('atla: profil uygulanmaz ama onboarding bir daha çıkmaz', async ({ page }) => {
    await page.goto('/')
    const dialog = page.locator('[role="dialog"][aria-modal="true"]')
    await dialog.getByRole('button', { name: 'Skip' }).click()
    await expect(dialog).toHaveCount(0)
    await page.reload()
    await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0)
  })
})
