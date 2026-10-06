import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcssVite from '@tailwindcss/vite'

// https://vite.dev/config/
// CALEM_DEVTOOLS=0 ile devtools eklentisiz çalışır (saf performans ölçümü için).
const useDevTools = process.env.CALEM_DEVTOOLS !== '0'
export default defineConfig({
  plugins: [
    vue(),
    ...(useDevTools ? [vueDevTools()] : []),
    tailwindcssVite(),
  ],
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@use "sass:math";`,
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
