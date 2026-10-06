import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

import '@/assets/index.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')

// PWA offline: sadece production'da register et, mount'u bloklama
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {
      /* offline desteği opsiyonel */
    })
  })
}
