// Seçim işlemleri: store op + arayüz tazeleme. Tazeleme üst bileşenden
// parametreyle gelir (panel 'changed' yayar, görünüm doğrudan çizer).
import { useDrawingStore } from '@/stores/drawing'

export function useSelectionOps(notify: () => void) {
  const store = useDrawingStore()
  const selAll = () => {
    store.selectAll()
    notify()
  }
  const selCopy = () => {
    store.copySelected()
    notify()
  }
  const selPaste = () => {
    store.pasteClipboard()
    notify()
  }
  const selDelete = () => {
    store.deleteSelected()
    notify()
  }
  return { selAll, selCopy, selPaste, selDelete }
}
