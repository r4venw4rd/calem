import { fileURLToPath, URL } from 'node:url'

import { configDefaults, defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcssVite from '@tailwindcss/vite'

// CALEM_DEVTOOLS=0 ile devtools eklentisiz çalışır (saf performans ölçümü için).
const useDevTools = process.env.CALEM_DEVTOOLS !== '0'
export default defineConfig({
  plugins: [vue(), ...(useDevTools ? [vueDevTools()] : []), tailwindcssVite()],
  // PWA: her build benzersiz sürüm damgası taşır → SW cache'i otomatik tazelenir (elle bump yok).
  define: { __CALEM_BUILD__: JSON.stringify(String(Date.now())) },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Birim testleri `tests/` altında; e2e ayrı koşar (playwright.config.ts).
    // Hariç tutulmazsa vitest, Playwright spec'lerini de toplamaya çalışır.
    exclude: [...configDefaults.exclude, 'tests/e2e/**', 'tests/e2e-pwa/**'],
  },
})
