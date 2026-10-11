import type { Ref } from 'vue'
import type { useDrawingStore } from '@/stores/drawing'
import type { usePointerState } from '@/composables/usePointerState'
import { coalescedOf } from '@/lib/select'

export interface UsePanGestureOptions {
  store: ReturnType<typeof useDrawingStore>
  ps: ReturnType<typeof usePointerState>
  overlayCanvas: Ref<HTMLCanvasElement | null>
  ptrPos: (e: PointerEvent) => { x: number; y: number }
  drawSelectionOverlay: () => void
  updateHud: (force?: boolean) => void
}

export function usePanGesture(options: UsePanGestureOptions) {
  const { store, ps, overlayCanvas, ptrPos, drawSelectionOverlay, updateHud } = options

  let panActive = false
  let panLast: { x: number; y: number } | null = null
  let panDx = 0
  let panDy = 0
  let panRaf = 0

  const panDown = (e: PointerEvent) => {
    try {
      overlayCanvas.value?.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    ps.setActive(e.pointerId)
    panLast = ptrPos(e)
    panActive = true
  }

  const schedulePan = () => {
    if (panRaf !== 0) return
    panRaf = requestAnimationFrame(() => {
      panRaf = 0
      if (panDx !== 0 || panDy !== 0) {
        store.panBy(panDx, panDy)
        panDx = 0
        panDy = 0
        drawSelectionOverlay()
        updateHud()
      }
    })
  }

  const panMove = (e: PointerEvent) => {
    // Space sonradan basılırsa devralınmaz (mürekkep gasp edilmesin) — önce Space, sonra bas.
    if (!panActive || !ps.isActive(e.pointerId)) return
    if (e.buttons === 0 && e.pointerType === 'mouse') return
    // Delta biriktir, boyayı rAF'e bırak: her move'da tam sahne boyası (repaintBase)
    // mobil GPU'da kasıyordu. Kalem yolundaki scheduleRender deseninin aynısı.
    for (const ev of coalescedOf(e)) {
      const cur = ptrPos(ev)
      if (!panLast) {
        panLast = cur
        continue
      }
      panDx += cur.x - panLast.x
      panDy += cur.y - panLast.y
      panLast = cur
    }
    schedulePan()
  }

  const panUp = (e?: PointerEvent) => {
    if (ps.stale(e)) return
    if (panRaf !== 0) {
      cancelAnimationFrame(panRaf)
      panRaf = 0
    }
    // Kuyrukta kalan deltayı çöpe atma — bırakıştaki son milimetre kaybolmasın.
    if (panDx !== 0 || panDy !== 0) {
      store.panBy(panDx, panDy)
      panDx = 0
      panDy = 0
    }
    panActive = false
    panLast = null
    ps.clearActive()
    updateHud(true)
  }

  const cancelPan = () => {
    if (panRaf !== 0) {
      cancelAnimationFrame(panRaf)
      panRaf = 0
    }
    panDx = 0
    panDy = 0
    panActive = false
    panLast = null
  }

  return {
    isPanActive: () => panActive,
    panDown,
    panMove,
    panUp,
    cancelPan,
  }
}
