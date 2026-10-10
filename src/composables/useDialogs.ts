// Uygulama-içi onay/soru diyaloğu (tekil durum).
// Native confirm()/prompt() bloklar, stillenemez ve fullscreen'de bastırılabilir;
// bu yüzden yıkıcı op'lar ve adlandırmalar aynı görsel dilde bir modal kullanır.
// Modal şablonu CanvasView'de durur, state+faksiyonlar burada — paneller de aynı
// tekil diyaloğu kullanır (aynı anda tek soru).
import { nextTick, ref } from 'vue'

const dialogOpen = ref(false)
const dialogKind = ref<'confirm' | 'prompt'>('confirm')
const dialogTitle = ref('')
const dialogMessage = ref('')
const dialogText = ref('')
const dialogPanel = ref<HTMLElement | null>(null)
const dialogInput = ref<HTMLInputElement | null>(null)
let dialogResolve: ((v: boolean | string | null) => void) | null = null

const closeDialog = (result: boolean | string | null) => {
  const r = dialogResolve
  dialogResolve = null
  dialogOpen.value = false
  r?.(result)
}

const askConfirm = (title: string, message = ''): Promise<boolean> =>
  new Promise((resolve) => {
    dialogResolve = resolve as (v: boolean | string | null) => void
    dialogKind.value = 'confirm'
    dialogTitle.value = title
    dialogMessage.value = message
    dialogOpen.value = true
    nextTick(() => dialogPanel.value?.querySelector<HTMLElement>('button')?.focus())
  })

const askPrompt = (title: string, def = ''): Promise<string | null> =>
  new Promise((resolve) => {
    dialogResolve = resolve as (v: boolean | string | null) => void
    dialogKind.value = 'prompt'
    dialogTitle.value = title
    dialogMessage.value = ''
    dialogText.value = def
    dialogOpen.value = true
    nextTick(() => {
      dialogInput.value?.focus()
      dialogInput.value?.select()
    })
  })

const dialogOk = () => {
  if (!dialogOpen.value) return
  closeDialog(dialogKind.value === 'prompt' ? dialogText.value : true)
}

const dialogCancel = () => {
  if (!dialogOpen.value) return
  closeDialog(dialogKind.value === 'prompt' ? null : false)
}

export function useDialogs() {
  return {
    dialogOpen,
    dialogKind,
    dialogTitle,
    dialogMessage,
    dialogText,
    dialogPanel,
    dialogInput,
    closeDialog,
    askConfirm,
    askPrompt,
    dialogOk,
    dialogCancel,
  }
}
