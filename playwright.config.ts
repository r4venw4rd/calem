import { defineConfig } from '@playwright/test'

// E2E kurulumu: gerçek pointer event'leriyle canvas davranışını doğrular.
// Chromium sistem Chrome'unu kullanır; Firefox ve WebKit için:
//   npx playwright install firefox webkit
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
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', channel: 'chrome' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    viewport: { width: 1280, height: 900 },
    // Piksel matematiği sade olsun: 1 CSS px = 1 canvas px.
    deviceScaleFactor: 1,
  },
  webServer: {
    command: `npm run dev:fast -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
