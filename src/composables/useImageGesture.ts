import { ref, computed, type Ref } from 'vue'
import type { useDrawingStore } from '@/stores/drawing'
import type { usePointerState } from '@/composables/usePointerState'
import { coalescedOf } from '@/lib/select'

export interface UseImageGestureOptions {
  store: ReturnType<typeof useDrawingStore>
  ps: ReturnType<typeof usePointerState>
  overlayCanvas: Ref<HTMLCanvasElement | null>
  viewTransformTick: Ref<number>
  updateHud: (force?: boolean) => void
  showPdfError: (err: string) => void
}

export function useImageGesture(options: UseImageGestureOptions) {
  const { store, ps, overlayCanvas, viewTransformTick, updateHud, showPdfError } = options

  const imgInput = ref<HTMLInputElement | null>(null)
  let imgPending: { x: number; y: number } | null = null
  let imgDownPos: { x: number; y: number } | null = null
  let imgDownHit: string | null = null
  let imgMoving = false
  let imgMoveId: string | null = null
  let imgMoveLast: { x: number; y: number } | null = null

  const activeImageScreenRect = computed(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    viewTransformTick.value
    const item = store.activeImage()
    if (!item) return null
    const vt = store.getViewTransform()
    const sx = item.x * vt.scale + vt.ox
    const sy = item.y * vt.scale + vt.oy
    const sw = item.w * vt.scale
    const sh = item.h * vt.scale
    return {
      left: sx,
      top: sy,
      bottom: sy + sh,
      width: sw,
      height: sh,
    }
  })

  const imageEditorContainerStyle = computed(() => {
    const r = activeImageScreenRect.value
    if (!r) return {}
    const pad = 12
    const left = Math.max(pad, r.left)
    // Resmin hemen altında dursun; üst toolbar'ın altına kaçmasın (>= 76px)
    const top = Math.max(76, r.bottom + 8)
    return {
      left: `${left}px`,
      top: `${top}px`,
      zIndex: 35,
    }
  })

  const cancelImageGesture = () => {
    imgDownPos = null
    imgDownHit = null
    imgMoving = false
    imgMoveId = null
    imgMoveLast = null
  }

  const imageDown = (e: PointerEvent) => {
    if (store.rejectTouch && e.pointerType === 'touch') return
    try {
      overlayCanvas.value?.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    ps.setActive(e.pointerId)
    const p = store.eventToPage(e)
    const hit = store.imageAt(p.x, p.y)
    imgDownPos = p
    imgDownHit = hit ? hit.id : null
    imgMoving = false
    imgMoveId = null
    imgMoveLast = null
    if (hit) {
      store.activeImageId = hit.id
    } else {
      store.activeImageId = null
    }
  }

  const imageMove = (e: PointerEvent) => {
    if (!ps.isActive(e.pointerId) || !imgDownPos) return
    if (e.buttons === 0 && e.pointerType === 'mouse') return
    for (const ev of coalescedOf(e)) {
      const p = store.eventToPage(ev)
      if (!imgMoving && imgDownHit) {
        const dx = p.x - imgDownPos.x
        const dy = p.y - imgDownPos.y
        if (dx * dx + dy * dy >= 9) {
          imgMoving = true
          imgMoveId = imgDownHit
          imgMoveLast = p
          store.pushHistory()
        }
      } else if (imgMoving && imgMoveId && imgMoveLast) {
        store.moveImage(imgMoveId, p.x - imgMoveLast.x, p.y - imgMoveLast.y)
        imgMoveLast = p
      }
    }
  }

  const imageUp = (e?: PointerEvent) => {
    if (ps.stale(e)) return
    const wasMoving = imgMoving
    const hit = imgDownHit
    const at = imgDownPos
    cancelImageGesture()
    ps.clearActive()
    if (wasMoving) {
      updateHud(true)
      return
    }
    if (!hit && at) {
      // Boşa tık: dosya seç → tıklanan noktaya yerleştir.
      imgPending = at
      imgInput.value?.click()
    }
    updateHud(true)
  }

  const onImageFile = async (e: Event) => {
    const input = e.target as HTMLInputElement
    const f = input.files?.[0]
    input.value = ''
    const at = imgPending
    imgPending = null
    if (!f || !at) return
    const res = await store.addImage(f, at.x, at.y)
    if ('error' in res) showPdfError(res.error)
    updateHud(true)
  }

  const onImgWidth = (n: number) => {
    const it = store.activeImage()
    if (!it || it.w === 0) return
    store.resizeImage(it.id, n, Math.round((n * it.h) / it.w))
  }

  const delActiveImage = () => {
    if (store.activeImageId) store.deleteImage(store.activeImageId)
    updateHud(true)
  }

  return {
    imgInput,
    hasImgDown: () => imgDownPos !== null,
    activeImageScreenRect,
    imageEditorContainerStyle,
    cancelImageGesture,
    imageDown,
    imageMove,
    imageUp,
    onImageFile,
    onImgWidth,
    delActiveImage,
  }
}
