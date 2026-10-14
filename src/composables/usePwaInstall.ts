// PWA kurulum teşviği: kurulu değilse her açılışta tek bant gösterir.
// - Kurulu sayılır: display-mode standalone / window-controls-overlay, iOS standalone.
// - Chrome/Edge/ChromeOS: beforeinstallprompt yakalanır, "Kur" doğrudan prompt açar.
// - Prompt destekleyen ama şu an hazır olmayan tarayıcı: manuel yol anlatılır (menü > yükle).
// - Kurulumu hiç desteklemeyen tarayıcı (Firefox/Safari): Chrome/Edge önerilir.
// - "Sonra" sadece o açılışı kapatır; yenileyince tekrar çıkar. appinstalled olursa
//   kurulu sayılır, bir daha gösterilmez.
import { computed, onMounted, onUnmounted, ref } from 'vue'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface Window {
    __calemBIP?: InstallPromptEvent
  }
}

/** index.html'deki erken dinleyicinin yakaladığı olay (mount'tan önce ateşlenmiş olabilir). */
const takeStashedPrompt = (): InstallPromptEvent | null => {
  const ev = typeof window === 'undefined' ? null : (window.__calemBIP ?? null)
  if (ev) window.__calemBIP = undefined
  return ev
}

/** Kurulum prompt'unu destekleyen tarayıcı mı? Chromium tabanlılar `window.chrome` taşır; Firefox/Safari taşımaz. */
export const isInstallSupported = (): boolean => {
  if (typeof window === 'undefined') return false
  return typeof (window as { chrome?: unknown }).chrome === 'object'
}

export const isStandaloneMode = (): boolean => {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  if (window.matchMedia('(display-mode: window-controls-overlay)').matches) return true
  return (navigator as unknown as { standalone?: boolean }).standalone === true
}

export function usePwaInstall() {
  const installed = ref(isStandaloneMode())
  const deferred = ref<InstallPromptEvent | null>(takeStashedPrompt())
  const hidden = ref(false)

  const canInstall = computed(() => deferred.value !== null)
  // Kurulum desteği açılış boyunca sabit; template bunu "manuel yol mu, Chrome önerisi mi" için kullanır.
  const installSupported = isInstallSupported()
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
    // Erken yakalanan olay mount sonrası da slota düşmüş olabilir.
    if (!deferred.value) deferred.value = takeStashedPrompt()
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

  return { showBanner, canInstall, installSupported, install, dismiss }
}
