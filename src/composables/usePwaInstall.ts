// PWA kurulum teşviği: kurulu değilse her açılışta tek bant gösterir.
// - Kurulu sayılır: display-mode standalone / window-controls-overlay, iOS standalone.
// - Chrome/Edge/ChromeOS: beforeinstallprompt yakalanır, "Kur" doğrudan prompt açar.
// - Prompt desteklenmeyen yerde (Firefox/iOS): bant, manuel yolu anlatır (menü > yükle).
// - "Sonra" sadece o açılışı kapatır; yenileyince tekrar çıkar. appinstalled olursa
//   kurulu sayılır, bir daha gösterilmez.
import { computed, onMounted, onUnmounted, ref } from 'vue'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export const isStandaloneMode = (): boolean => {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  if (window.matchMedia('(display-mode: window-controls-overlay)').matches) return true
  return (navigator as unknown as { standalone?: boolean }).standalone === true
}

export function usePwaInstall() {
  const installed = ref(isStandaloneMode())
  const deferred = ref<InstallPromptEvent | null>(null)
  const hidden = ref(false)

  const canInstall = computed(() => deferred.value !== null)
  // Kurulu değilse + bu açılışta kapatılmadıysa göster.
  const showBanner = computed(() => !installed.value && !hidden.value)

  const onBeforeInstall = (e: Event) => {
    e.preventDefault()
    deferred.value = e as InstallPromptEvent
  }
  const onInstalled = () => {
    installed.value = true
    deferred.value = null
  }
  const onModeChange = () => {
    installed.value = isStandaloneMode()
  }
  let modeMq: MediaQueryList | null = null

  onMounted(() => {
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    modeMq = window.matchMedia('(display-mode: standalone)')
    modeMq.addEventListener('change', onModeChange)
  })
  onUnmounted(() => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstall)
    window.removeEventListener('appinstalled', onInstalled)
    modeMq?.removeEventListener('change', onModeChange)
    modeMq = null
  })

  const dismiss = () => {
    hidden.value = true
  }

  const install = async () => {
    const ev = deferred.value
    if (!ev) {
      dismiss()
      return
    }
    try {
      await ev.prompt()
      const choice = await ev.userChoice
      if (choice.outcome === 'accepted') installed.value = true
      else dismiss()
    } catch {
      dismiss()
    } finally {
      deferred.value = null
    }
  }

  return { showBanner, canInstall, install, dismiss }
}
