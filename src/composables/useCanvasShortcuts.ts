import type { Ref } from 'vue'
import type { useDrawingStore } from '../stores/drawing'
import type { usePointerState } from '../composables/usePointerState'

export interface CanvasShortcutsOptions {
  quickSaveDoc: () => void | Promise<void>
  presenting: Ref<boolean>
  togglePresent: () => void | Promise<void>
  closeMenus: () => boolean
  dialogOpen: Ref<boolean>
  dialogCancel: () => void
  nextPage: () => void
  prevPage: () => void
  isAnyPanelOpen: () => boolean
  ps: ReturnType<typeof usePointerState>
  store: ReturnType<typeof useDrawingStore>
  drawSelectionOverlay: () => void
  updateHud: (force?: boolean) => void
  isSelActive: () => boolean
  cancelSelGesture: () => void
  closeTextEditor: () => void
  cancelImageGesture: () => void
  showFile: Ref<boolean>
}

export function useCanvasShortcuts(opts: CanvasShortcutsOptions) {
  const {
    quickSaveDoc,
    presenting,
    togglePresent,
    closeMenus,
    dialogOpen,
    dialogCancel,
    nextPage,
    prevPage,
    isAnyPanelOpen,
    ps,
    store,
    drawSelectionOverlay,
    updateHud,
    isSelActive,
    cancelSelGesture,
    closeTextEditor,
    cancelImageGesture,
    showFile,
  } = opts

  // Input'ta yazarken tetiklenmez; çizim sırasında el klavyedeyse çalışır.
  const onKeyDown = (e: KeyboardEvent) => {
    // Ctrl/Cmd+S: hızlı kayıt (.calem). Kayıtlı dosya varsa üstüne yazar,
    // yoksa konum sorar. Metin alanı dahil her yerde çalışır.
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault()
      if (!e.repeat) void quickSaveDoc()
      return
    }
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
    const mod = e.ctrlKey || e.metaKey
    // Sunumda Esc her şeyden önce çıkar (editör dalları sunumda gizlidir).
    if (!mod && !e.altKey && e.key === 'Escape' && presenting.value) {
      void togglePresent()
      return
    }
    // Açık menü varsa Esc önce onu kapatır (seçim/editör dallarından önce).
    if (!mod && !e.altKey && e.key === 'Escape') {
      if (closeMenus()) return
    }
    // Uygulama-içi diyalog açıksa Esc iptal eder.
    if (!mod && !e.altKey && e.key === 'Escape' && dialogOpen.value) {
      dialogCancel()
      return
    }
    // Sunumda klavyeyle sayfa ilerlet/geri (uzaktan kumanda/klavye ile sunum).
    if (presenting.value && !mod && !e.altKey) {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) {
        e.preventDefault()
        nextPage()
        return
      }
      if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) {
        e.preventDefault()
        prevPage()
        return
      }
    }
    // Açık bir diyalog/panel varken araç kısayolları arkada tetiklenmesin (scrim altında state değişmesin).
    if (isAnyPanelOpen() || dialogOpen.value) return
    // Sayfa gezinme: PageDown/PageUp her araçta çalışır.
    if (!mod && !e.altKey && (e.key === 'PageDown' || e.key === 'PageUp')) {
      e.preventDefault()
      if (e.key === 'PageDown') nextPage()
      else prevPage()
      return
    }
    // Space basılı kaydırma (önce Space, sonra sürükle). Tekrarlanan keydown yoksayılır.
    if (!mod && !e.altKey && e.key === ' ' && !e.repeat) {
      if (t && t.tagName === 'BUTTON') return
      e.preventDefault()
      ps.setSpacePan(true)
      return
    }
    // Seçim aracı kısayolları (modsuz): sil / kaç / oklarla dürt.
    if (!mod && !e.altKey && store.currentTool === 'select') {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        store.deleteSelected()
        drawSelectionOverlay()
        updateHud(true)
        return
      }
      if (e.key === 'Escape') {
        if (isSelActive()) cancelSelGesture()
        else store.clearSelection()
        drawSelectionOverlay()
        return
      }
      if (e.key.startsWith('Arrow')) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 2
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        if (dx || dy) {
          // Aynı ok grubu tek undo: basılı tutunca onlarca kayıt açmasın.
          store.pushHistoryKeyed('nudge')
          store.moveSelected(dx, dy)
          drawSelectionOverlay()
          updateHud(true)
        }
        return
      }
    }
    // Metin aracı kısayolları (modsuz): sil / kapat.
    if (!mod && !e.altKey && store.currentTool === 'text') {
      if ((e.key === 'Delete' || e.key === 'Backspace') && store.activeTextId) {
        e.preventDefault()
        store.deleteText(store.activeTextId)
        updateHud(true)
        return
      }
      if (e.key === 'Escape' && store.activeTextId) {
        closeTextEditor()
        return
      }
    }
    // Resim aracı kısayolları (modsuz): sil / kapat.
    if (!mod && !e.altKey && store.currentTool === 'image') {
      if ((e.key === 'Delete' || e.key === 'Backspace') && store.activeImageId) {
        e.preventDefault()
        store.deleteImage(store.activeImageId)
        updateHud(true)
        return
      }
      if (e.key === 'Escape') {
        cancelImageGesture()
        store.activeImageId = null
        return
      }
    }
    // Araç kısayolları (modsuz): V seç, P kalem, H vurgu, E silgi, L/R/O/A şekiller, T metin, G resim, F sunum, D çoğalt.
    if (!mod && !e.altKey) {
      const k = e.key.toLowerCase()
      if (k === 'v') {
        store.setTool('select')
        return
      }
      if (k === 'p') {
        store.setTool('pen')
        return
      }
      if (k === 'h') {
        store.setTool('highlighter')
        return
      }
      if (k === 'e') {
        store.setTool('eraser')
        return
      }
      if (k === 'l') {
        store.setTool('line')
        return
      }
      if (k === 'r') {
        store.setTool('rect')
        return
      }
      if (k === 'o') {
        store.setTool('ellipse')
        return
      }
      if (k === 'a') {
        store.setTool('arrow')
        return
      }
      if (k === 't') {
        store.setTool('text')
        return
      }
      if (k === 'g') {
        store.setTool('image')
        return
      }
      if (k === 'd') {
        showFile.value = false
        store.duplicatePage()
        updateHud(true)
        return
      }
      if (k === 'f') {
        void togglePresent()
        return
      }
    }
    if (!mod || e.altKey) return
    const key = e.key.toLowerCase()
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault()
      store.undoLastStroke()
      drawSelectionOverlay()
      updateHud(true)
    } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
      e.preventDefault()
      store.redo()
      drawSelectionOverlay()
      updateHud(true)
    } else if (key === 'a' && store.currentTool === 'select') {
      e.preventDefault()
      store.selectAll()
      drawSelectionOverlay()
      updateHud(true)
    } else if (key === 'c' && store.currentTool === 'select') {
      e.preventDefault()
      store.copySelected()
      updateHud(true)
    } else if (key === 'x' && store.currentTool === 'select') {
      e.preventDefault()
      store.cutSelected()
      drawSelectionOverlay()
      updateHud(true)
    } else if (key === 'v') {
      // Panoda içerik varsa seçime geçip yapıştır.
      if (store.clipboardCount === 0) return
      e.preventDefault()
      if (store.currentTool !== 'select') store.setTool('select')
      store.pasteClipboard()
      drawSelectionOverlay()
      updateHud(true)
    }
  }

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === ' ') ps.setSpacePan(false)
    // Ok bırakılınca dürtme grubunu kapat — sonraki dürtme ayrı undo olsun.
    if (e.key.startsWith('Arrow')) store.endHistoryGroup()
  }

  return { onKeyDown, onKeyUp }
}
