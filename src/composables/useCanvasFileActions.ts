import { ref, type Ref } from 'vue'
import type { useDrawingStore } from '../stores/drawing'
import { pngFileName } from '../config/files'
import { takeLaunchHandle, type LaunchHandle } from '../lib/launchFile'
import type { UIKey } from '../config/locale'

export interface CanvasFileActionsOptions {
  store: ReturnType<typeof useDrawingStore>
  showFile: Ref<boolean>
  t: (key: UIKey) => string
  askConfirm: (msg: string) => Promise<boolean>
  updateHud: (force?: boolean) => void
  refreshThumbs: () => void
}

export function useCanvasFileActions(opts: CanvasFileActionsOptions) {
  const { store, showFile, t, askConfirm, updateHud, refreshThumbs } = opts

  const actionError = ref('')
  const calemInput = ref<HTMLInputElement | null>(null)
  const xoppInput = ref<HTMLInputElement | null>(null)

  const showActionError = (msg: string) => {
    actionError.value = msg
    window.setTimeout(() => {
      if (actionError.value === msg) actionError.value = ''
    }, 4000)
  }

  const exportPng = () => {
    showFile.value = false
    const url = store.exportDataURL()
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = pngFileName()
    a.click()
  }

  const onPdfFile = async (e: Event) => {
    showFile.value = false
    const input = e.target as HTMLInputElement
    const f = input.files?.[0]
    input.value = ''
    if (!f) return
    const hasInk = store.hasInk
    if (hasInk && !(await askConfirm(t('pdfReplace')))) return
    const res = await store.importPdf(f)
    if ('error' in res) showActionError(res.error)
    updateHud(true)
  }

  const exportPdfDoc = async () => {
    showFile.value = false
    const res = await store.exportPdf()
    // cancelled = kullanıcı picker'da vazgeçti → hata değil, sessizlik
    if ('error' in res) showActionError(res.error)
  }

  const quickSaveDoc = async () => {
    showFile.value = false
    const res = await store.quickSaveCalem()
    if ('error' in res) showActionError(res.error)
  }

  const openCalemDoc = async () => {
    showFile.value = false
    if (store.hasInk && !(await askConfirm(t('calemReplace')))) return
    const w = window as unknown as {
      showOpenFilePicker?: (opts: {
        types?: { description?: string; accept: Record<string, string[]> }[]
        multiple?: boolean
      }) => Promise<
        {
          getFile: () => Promise<File>
          createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }>
        }[]
      >
    }
    if (typeof w.showOpenFilePicker === 'function') {
      try {
        const [handle] = await w.showOpenFilePicker({
          types: [{ description: 'Calem belgesi', accept: { 'application/json': ['.calem'] } }],
          multiple: false,
        })
        if (!handle) return
        const res = await store.importCalem(await handle.getFile())
        if ('error' in res) {
          showActionError(res.error)
          return
        }
        await store.setCalemHandle(handle)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        showActionError(err instanceof Error ? `${t('errFileOpen')} (${err.message})` : t('errFileOpen'))
        return
      }
    } else {
      calemInput.value?.click()
      return
    }
    updateHud(true)
    refreshThumbs()
  }

  // PWA dosya ilişkilendirme ile gelen .calem: doğrula → aç → handle'ı sakla (Ctrl+S yazar).
  const openLaunchedFile = async (handle: LaunchHandle) => {
    if (store.hasInk && !(await askConfirm(t('calemReplace')))) return
    let file: File
    try {
      file = await handle.getFile()
    } catch {
      return
    }
    const res = await store.importCalem(file)
    if ('error' in res) {
      showActionError(res.error)
      return
    }
    await store.setCalemHandle(handle)
    store.dismissSavedSession()
    updateHud(true)
    refreshThumbs()
  }

  const drainLaunchSlot = () => {
    const h = takeLaunchHandle()
    if (h) void openLaunchedFile(h)
  }

  const onCalemFile = async (e: Event) => {
    showFile.value = false
    const input = e.target as HTMLInputElement
    const f = input.files?.[0]
    input.value = ''
    if (!f) return
    if (store.hasInk && !(await askConfirm(t('calemReplace')))) return
    const res = await store.importCalem(f)
    if ('error' in res) showActionError(res.error)
    else await store.setCalemHandle(null)
    updateHud(true)
    refreshThumbs()
  }

  const openXoppDoc = async () => {
    showFile.value = false
    if (store.hasInk && !(await askConfirm(t('calemReplace')))) return
    const w = window as unknown as {
      showOpenFilePicker?: (opts: {
        types?: { description?: string; accept: Record<string, string[]> }[]
        multiple?: boolean
      }) => Promise<{ getFile: () => Promise<File> }[]>
    }
    if (typeof w.showOpenFilePicker === 'function') {
      try {
        const [handle] = await w.showOpenFilePicker({
          types: [{ description: 'Xournal++ belgesi', accept: { 'application/x-xopp': ['.xopp'] } }],
          multiple: false,
        })
        if (!handle) return
        const res = await store.importXopp(await handle.getFile())
        if ('error' in res) showActionError(res.error)
        updateHud(true)
        refreshThumbs()
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        showActionError(err instanceof Error ? `${t('errFileOpen')} (${err.message})` : t('errFileOpen'))
      }
    } else {
      xoppInput.value?.click()
    }
  }

  const onXoppFile = async (e: Event) => {
    showFile.value = false
    const input = e.target as HTMLInputElement
    const f = input.files?.[0]
    input.value = ''
    if (!f) return
    if (store.hasInk && !(await askConfirm(t('calemReplace')))) return
    const res = await store.importXopp(f)
    if ('error' in res) showActionError(res.error)
    updateHud(true)
    refreshThumbs()
  }

  const exportXoppDoc = async () => {
    showFile.value = false
    const res = await store.exportXopp()
    if ('error' in res) showActionError(res.error)
  }

  const askClosePdf = async () => {
    showFile.value = false
    const hasInk = store.hasInk
    if (hasInk && !(await askConfirm(t('pdfClose')))) return
    store.closePdf()
    updateHud(true)
  }

  return {
    actionError,
    showActionError,
    calemInput,
    xoppInput,
    exportPng,
    onPdfFile,
    exportPdfDoc,
    quickSaveDoc,
    openCalemDoc,
    openLaunchedFile,
    drainLaunchSlot,
    onCalemFile,
    openXoppDoc,
    onXoppFile,
    exportXoppDoc,
    askClosePdf,
  }
}
