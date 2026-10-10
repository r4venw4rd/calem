import { defineConfig } from '@playwright/test'

// E2E kurulumu: gerçek pointer event'leriyle canvas davranışını doğrular.
// Tarayıcı olarak SİSTEM Chrome kullanılır (`channel: 'chrome'`) — Playwright'ın
// ~150MB Chromium indirmesine gerek kalmazsın. Farklı bir sürüm istersen:
//   npx playwright install chromium   (+ channel satırını kaldır)
// Sunucu ayrı portta ayağa kalkar; açık bir `npm run dev` ile çakışmaz.
const PORT = 5199

export default defineConfig({
  testDir: './tests/e2e',
  // Canvas akışı sıralı adımlara bağlı; paralel worker paylaşılan portu bozar.
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 5_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'chrome',
    headless: true,
    viewport: { width: 1280, height: 900 },
    // Piksel matematiği sade olsun: 1 CSS px = 1 canvas px.
    deviceScaleFactor: 1,
  },
  webServer: {
    command: `npm run dev:fast -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
