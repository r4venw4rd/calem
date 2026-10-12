import { ref, computed, type Ref } from 'vue'
import type { useDrawingStore } from '@/stores/drawing'
import type { usePointerState } from '@/composables/usePointerState'
import type TextEditorOverlay from '@/components/TextEditorOverlay.vue'
import { coalescedOf } from '@/lib/select'

export interface UseTextGestureOptions {
  store: ReturnType<typeof useDrawingStore>
  ps: ReturnType<typeof usePointerState>
  overlayCanvas: Ref<HTMLCanvasElement | null>
  viewTransformTick: Ref<number>
  updateHud: (force?: boolean) => void
}

export function useTextGesture(options: UseTextGestureOptions) {
  const { store, ps, overlayCanvas, viewTransformTick, updateHud } = options

  const textOverlayRef = ref<InstanceType<typeof TextEditorOverlay> | null>(null)

  let textDownPos: { x: number; y: number } | null = null
  let textDownHit: string | null = null
  let textMoving = false
  let textMoveId: string | null = null
  let textMoveLast: { x: number; y: number } | null = null
  // Boş alanda sürükleme: Xournal metin kutusu gibi genişlik seçimi (canlı önizleme).
  let textBoxing = false
  let textBoxCurrent: { x: number; y: number } | null = null

  const cancelTextGesture = () => {
    textDownPos = null
    textDownHit = null
    textMoving = false
    textMoveId = null
    textMoveLast = null
    textBoxing = false
    textBoxCurrent = null
  }

  // Sürükleyerek metin kutusu seçiminin kesikli önizlemesi (overlay'e doğrudan).
  const drawTextBoxOverlay = () => {
    const c = overlayCanvas.value
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const dpr = store.dpr || window.devicePixelRatio || 1
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    if (!textBoxing || !textDownPos || !textBoxCurrent) return
    const t = store.getViewTransform()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const sx = (x: number) => x * t.scale + t.ox
    const sy = (y: number) => y * t.scale + t.oy
    const x0 = sx(Math.min(textDownPos.x, textBoxCurrent.x))
    const y0 = sy(Math.min(textDownPos.y, textBoxCurrent.y))
    const x1 = sx(Math.max(textDownPos.x, textBoxCurrent.x))
    const y1 = sy(Math.max(textDownPos.y, textBoxCurrent.y))
    ctx.save()
    ctx.setLineDash([6, 4])
    ctx.lineWidth = 1.2
    ctx.strokeStyle = '#818cf8'
    ctx.fillStyle = 'rgba(99,102,241,0.08)'
    ctx.beginPath()
    ctx.rect(x0, y0, x1 - x0, y1 - y0)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  const closeTextEditor = () => {
    const t = store.activeText()
    // Boş bırakılan kutu çöp olmasın.
    if (t && !t.text) store.deleteText(t.id)
    else store.clearActiveText()
  }

  const textDown = (e: PointerEvent) => {
    if (store.rejectTouch && e.pointerType === 'touch') return
    try {
      overlayCanvas.value?.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    ps.setActive(e.pointerId)
    const p = store.eventToPage(e)
    const hit = store.textAt(p.x, p.y)

    // Farklı bir yere tıklandıysa veya boş alana basıldıysa açık metin editörünü bitir
    if (store.activeTextId && (!hit || hit.id !== store.activeTextId)) {
      closeTextEditor()
    }

    textDownPos = p
    textDownHit = hit ? hit.id : null
    textMoving = false
    textMoveId = null
    textMoveLast = null
    // Boş alan: metin kutusu seçimine başla (sürüklenirse genişlik; tıklanırsa serbest metin).
    textBoxing = !hit
    textBoxCurrent = textBoxing ? p : null
    if (textBoxing) drawTextBoxOverlay()
  }

  const textMove = (e: PointerEvent) => {
    if (!ps.isActive(e.pointerId) || !textDownPos) return
    if (e.buttons === 0 && e.pointerType === 'mouse') return
    for (const ev of coalescedOf(e)) {
      const p = store.eventToPage(ev)
      if (!textMoving && textDownHit) {
        const dx = p.x - textDownPos.x
        const dy = p.y - textDownPos.y
        if (dx * dx + dy * dy >= 9) {
          textMoving = true
          textMoveId = textDownHit
          textMoveLast = p
          store.pushHistory()
          store.clearActiveText()
        }
      } else if (textMoving && textMoveId && textMoveLast) {
        store.moveText(textMoveId, p.x - textMoveLast.x, p.y - textMoveLast.y)
        textMoveLast = p
      } else if (textBoxing) {
        textBoxCurrent = p
      }
    }
    if (textBoxing) drawTextBoxOverlay()
  }

  const textUp = (e?: PointerEvent) => {
    if (ps.stale(e)) return
    const wasMoving = textMoving
    const hit = textDownHit
    const at = textDownPos
    const boxCur = textBoxCurrent
    const wasBoxing = textBoxing
    cancelTextGesture()
    ps.clearActive()
    if (wasBoxing) drawTextBoxOverlay()
    if (wasMoving) {
      updateHud(true)
      return
    }
    if (hit) {
      // Mevcut metne tık: düzenle.
      store.activeTextId = hit
    } else if (at) {
      // Ölçek/pt uzayında anlamlı sürükleme → kutu genişliği; aksi halde serbest metin.
      const dx = boxCur ? Math.abs(boxCur.x - at.x) : 0
      if (boxCur && dx >= 14) {
        store.createText(Math.min(at.x, boxCur.x), Math.min(at.y, boxCur.y), dx)
      } else {
        store.createText(at.x, at.y)
      }
    }
    updateHud(true)
  }

  const onTextInput = (e: Event) => {
    if (!store.activeTextId) return
    store.updateText(store.activeTextId, (e.target as HTMLTextAreaElement).value)
  }

  const onTextSizeInput = (n: number) => {
    if (!store.activeTextId) return
    store.updateTextStyle(store.activeTextId, { size: n })
  }

  const onTextColorInput = (hex: string) => {
    if (!store.activeTextId) return
    store.updateTextStyle(store.activeTextId, { color: hex })
  }

  const delActiveText = () => {
    const t = store.activeText()
    if (t) store.deleteText(t.id)
    updateHud(true)
  }

  const activeTextScreenRect = computed(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    viewTransformTick.value
    const item = store.activeText()
    if (!item) return null
    const vt = store.getViewTransform()
    const sx = item.x * vt.scale + vt.ox
    const sy = item.y * vt.scale + vt.oy
    const fontPx = Math.max(12, Math.round(item.size * vt.scale))
    const w = item.w ?? 0
    const boxW = Math.max(180, w > 0 ? w * vt.scale : 260)
    return {
      left: sx,
      top: sy,
      width: boxW,
      fontPx,
    }
  })

  const textEditorContainerStyle = computed(() => {
    const r = activeTextScreenRect.value
    if (!r) return {}
    const pad = 12
    const maxW = typeof window !== 'undefined' ? window.innerWidth - pad * 2 : 600
    const width = Math.min(r.width, maxW)
    const left = Math.max(
      pad,
      Math.min(r.left, typeof window !== 'undefined' ? window.innerWidth - width - pad : r.left),
    )
    // Üst menü çubuğunun (toolbar) altına girmemesi için desktop'ta en az 72px pay
    const top = Math.max(76, r.top)
    return {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      zIndex: 35,
    }
  })

  return {
    textOverlayRef,
    hasTextDown: () => textDownPos !== null,
    cancelTextGesture,
    drawTextBoxOverlay,
    textDown,
    textMove,
    textUp,
    onTextInput,
    onTextSizeInput,
    onTextColorInput,
    closeTextEditor,
    delActiveText,
    activeTextScreenRect,
    textEditorContainerStyle,
  }
}
