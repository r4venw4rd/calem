import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { useDrawingStore } from './stores/drawing'
import { pushLaunchHandle } from './lib/launchFile'
import { SERVICE_WORKER_PATH } from './config/files'

import '@/assets/index.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')

// PWA offline: sadece production'da register et, mount'u bloklama
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(SERVICE_WORKER_PATH).catch(() => {
      /* offline desteği opsiyonel */
    })
  })
}

// PWA dosya ilişkilendirme (.calem): kurulu uygulamada çift tıklanan dosya.
// Soğuk açılışta slot'a düşer (view mount'ta tüketir), sıcak açılışta listener'a gider.
const lq = (
  window as unknown as {
    launchQueue?: { setConsumer: (cb: (params: { files?: FileSystemFileHandle[] }) => void) => void }
  }
).launchQueue
lq?.setConsumer((params) => {
  const h = params.files?.[0]
  if (h) pushLaunchHandle(h)
})

// SW güncellenince tek seferlik yenile: önce IDB'ye flush'la,
// açılışta autosave + kayıtlı .calem handle geri gelir, iş kaybolmaz.
let refreshing = false
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    try {
      const store = useDrawingStore()
      void Promise.resolve(store.persistNow())
        .catch(() => {})
        .finally(() => window.location.reload())
    } catch {
      window.location.reload()
    }
  })
}
