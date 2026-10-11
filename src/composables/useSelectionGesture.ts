import { ref, type Ref } from 'vue'
import type { useDrawingStore } from '../stores/drawing'
import type { usePointerState } from './usePointerState'
import { coalescedOf, selectionBBox, strokeAtPoint } from '../lib/select'

export interface SelectionGestureOptions {
  overlayCanvas: Ref<HTMLCanvasElement | null>
  store: ReturnType<typeof useDrawingStore>
  ps: ReturnType<typeof usePointerState>
  viewTransformTick: Ref<number>
  updateHud: (force?: boolean) => void
}

export function useSelectionGesture(opts: SelectionGestureOptions) {
  const { overlayCanvas, store, ps, viewTransformTick, updateHud } = opts

  let selActive = false
  let selAnchor: { x: number; y: number } | null = null
  let selCurrent: { x: number; y: number } | null = null
  let selPoly: { x: number; y: number }[] | null = null
  let selMoving = false
  let selLast: { x: number; y: number } | null = null
  let selHistOpen = false

  const isSelActive = () => selActive

  const cancelSelGesture = () => {
    selActive = false
    selMoving = false
    selLast = null
    selAnchor = null
    selCurrent = null
    selPoly = null
    selHistOpen = false
    ps.clearActive()
  }

  const drawSelectionOverlay = () => {
    viewTransformTick.value++
    const c = overlayCanvas.value
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const dpr = store.dpr || window.devicePixelRatio || 1
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    const hasMarquee = selAnchor && selCurrent
    const hasPoly = selPoly && selPoly.length > 1
    const hasSel = store.selectionCount > 0
    if (store.currentTool !== 'select' || (!hasMarquee && !hasPoly && !hasSel)) return
    const t = store.getViewTransform()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const sx = (x: number) => x * t.scale + t.ox
    const sy = (y: number) => y * t.scale + t.oy
    ctx.save()
    ctx.setLineDash([6, 4])
    ctx.lineWidth = 1.2
    if (hasMarquee && selAnchor && selCurrent) {
      const x0 = sx(Math.min(selAnchor.x, selCurrent.x))
      const y0 = sy(Math.min(selAnchor.y, selCurrent.y))
      const x1 = sx(Math.max(selAnchor.x, selCurrent.x))
      const y1 = sy(Math.max(selAnchor.y, selCurrent.y))
      ctx.strokeStyle = '#818cf8'
      ctx.fillStyle = 'rgba(99,102,241,0.08)'
      ctx.beginPath()
      ctx.rect(x0, y0, x1 - x0, y1 - y0)
      ctx.fill()
      ctx.stroke()
    }
    if (hasPoly && selPoly) {
      ctx.strokeStyle = '#818cf8'
      ctx.beginPath()
      selPoly.forEach((p, i) => {
        if (i === 0) ctx.moveTo(sx(p.x), sy(p.y))
        else ctx.lineTo(sx(p.x), sy(p.y))
      })
      ctx.stroke()
    }
    if (hasSel) {
      const bb = selectionBBox(store.activePage.layers.filter((layer) => layer.visible).flatMap((layer) => layer.strokes), store.selectedIds)
      const imageBoxes = store.visibleImages().filter((img) => store.selectedIds.includes(img.id))
      const bounds = imageBoxes.reduce((r, img) => ({
        x0: Math.min(r?.x0 ?? Infinity, img.x),
        y0: Math.min(r?.y0 ?? Infinity, img.y),
        x1: Math.max(r?.x1 ?? -Infinity, img.x + img.w),
        y1: Math.max(r?.y1 ?? -Infinity, img.y + img.h),
      }), bb)
      if (bounds) {
        const x0 = sx(bounds.x0)
        const y0 = sy(bounds.y0)
        const x1 = sx(bounds.x1)
        const y1 = sy(bounds.y1)
        ctx.strokeStyle = '#6366f1'
        ctx.setLineDash([6, 4])
        ctx.beginPath()
        ctx.rect(x0, y0, x1 - x0, y1 - y0)
        ctx.stroke()
        // Köşe tutamaçları
        ctx.setLineDash([])
        ctx.fillStyle = '#6366f1'
        for (const [hx, hy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as const) {
          ctx.fillRect(hx - 3, hy - 3, 6, 6)
        }
      }
    }
    ctx.restore()
  }

  const selInside = (p: { x: number; y: number }): boolean => {
    const raw = selectionBBox(store.activePage.layers.filter((layer) => layer.visible).flatMap((layer) => layer.strokes), store.selectedIds)
    let bb = raw ? { ...raw } : null
    for (const img of store.visibleImages()) {
      if (!store.selectedIds.includes(img.id)) continue
      if (bb) {
        bb.x0 = Math.min(bb.x0, img.x)
        bb.y0 = Math.min(bb.y0, img.y)
        bb.x1 = Math.max(bb.x1, img.x + img.w)
        bb.y1 = Math.max(bb.y1, img.y + img.h)
      } else return p.x >= img.x && p.x <= img.x + img.w && p.y >= img.y && p.y <= img.y + img.h
    }
    if (!bb) return false
    return p.x >= bb.x0 && p.x <= bb.x1 && p.y >= bb.y0 && p.y <= bb.y1
  }

  const selectDown = (e: PointerEvent) => {
    if (store.rejectTouch && e.pointerType === 'touch') return
    try {
      overlayCanvas.value!.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    ps.setActive(e.pointerId)
    const p = store.eventToPage(e)

    // 1. Zaten seçili bir öğenin sınırları içine tıklandıysa: anında taşımaya başla
    if (store.selectionCount > 0 && selInside(p)) {
      selMoving = true
      selLast = p
      selActive = true
    } else {
      // 2. Bir nesneye (örneğin üçgen, çizgi, şekil) doğrudan tıklandı mı?
      const layers = store.activePage.layers.filter((layer) => layer.visible)
      const hitStroke = strokeAtPoint(layers.slice().reverse().flatMap((layer) => layer.strokes), p.x, p.y)
      const hitImage = [...store.visibleImages()].reverse().find((img) =>
        p.x >= img.x && p.x <= img.x + img.w && p.y >= img.y && p.y <= img.y + img.h,
      )
      const hitId = hitStroke ?? hitImage?.id ?? null
      if (hitId) {
        store.selectedIds = [hitId]
        selMoving = true
        selLast = p
        selActive = true
      } else if (store.selectMode === 'lasso') {
        store.clearSelection()
        selPoly = [p]
        selActive = true
      } else {
        store.clearSelection()
        selAnchor = p
        selCurrent = p
        selActive = true
      }
    }
    drawSelectionOverlay()
  }

  const selectMove = (e: PointerEvent) => {
    if (!selActive || !ps.isActive(e.pointerId)) return
    if (e.buttons === 0 && e.pointerType === 'mouse') return
    for (const ev of coalescedOf(e)) {
      const p = store.eventToPage(ev)
      if (selMoving && selLast) {
        if (!selHistOpen) {
          selHistOpen = true
          store.pushHistory()
        }
        store.moveSelected(p.x - selLast.x, p.y - selLast.y)
        selLast = p
      } else if (selPoly) {
        const last = selPoly[selPoly.length - 1]!
        const dx = p.x - last.x
        const dy = p.y - last.y
        if (dx * dx + dy * dy >= 4) selPoly.push(p)
      } else if (selAnchor) {
        selCurrent = p
      }
    }
    drawSelectionOverlay()
  }

  const selectUp = (e?: PointerEvent) => {
    if (ps.stale(e)) return
    if (!selActive) {
      ps.clearActive()
      return
    }
    selActive = false
    ps.clearActive()
    selHistOpen = false
    if (selMoving) {
      selMoving = false
      selLast = null
      if (selHistOpen) store.scheduleSave()
    } else if (selPoly) {
      const poly = selPoly
      selPoly = null
      if (poly.length >= 3) store.selectLassoArea(poly)
      else if (poly.length > 0) store.selectRectArea(poly[0]!, poly[0]!)
    } else if (selAnchor && selCurrent) {
      const a = selAnchor
      const b = selCurrent
      selAnchor = null
      selCurrent = null
      store.selectRectArea(a, b)
    }
    drawSelectionOverlay()
    updateHud(true)
  }

  return {
    isSelActive,
    cancelSelGesture,
    drawSelectionOverlay,
    selInside,
    selectDown,
    selectMove,
    selectUp,
  }
}
