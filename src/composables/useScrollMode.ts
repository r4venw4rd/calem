import { nextTick, onUnmounted, ref, watch, type Ref } from 'vue'
import type { useDrawingStore } from '../stores/drawing'
import type { usePointerState } from './usePointerState'

export interface ScrollModeOptions {
  store: ReturnType<typeof useDrawingStore>
  ps: ReturnType<typeof usePointerState>
  cancelAllGestures: () => void
  bindCanvases: () => void
  drawSelectionOverlay: () => void
  updateHud: (force?: boolean) => void
}

export function useScrollMode(opts: ScrollModeOptions) {
  const { store, ps, cancelAllGestures, bindCanvases, drawSelectionOverlay, updateHud } = opts

  const scrollMode = ref(false)
  const scrollBox = ref<HTMLElement | null>(null)
  const activeSlot = ref<HTMLElement | null>(null)
  const blockEls = new Map<string, HTMLElement>()

  const setBlockRef = (el: unknown, id: string) => {
    if (el instanceof HTMLElement) blockEls.set(id, el)
    else blockEls.delete(id)
  }

  // Aktif slotu aktif bloğun üstüne oturtur (ölçüler bloktan, eşleşme birebir).
  const positionSlot = () => {
    if (!scrollMode.value || !scrollBox.value || !activeSlot.value) return
    const slot = activeSlot.value
    const pg = store.pages[store.activePageIndex]
    const block = pg ? blockEls.get(pg.id) : undefined
    if (!block || block.offsetWidth === 0) {
      slot.style.display = 'none'
      return
    }
    slot.style.display = ''
    slot.style.top = `${block.offsetTop}px`
    slot.style.left = `${block.offsetLeft}px`
    slot.style.width = `${block.offsetWidth}px`
    slot.style.height = `${block.offsetHeight}px`
  }

  // Programatik kaydırma ANİMASYONSUZ (`behavior: auto`): smooth scrollIntoView
  // kullanıcı girdisiyle dövüşüyordu — animasyon sürerken tekerlek yutuluyor,
  // görünüm aktif sayfadan kopuyordu (özellikle hızlı art arda eklemede).
  // Ani iniş her zaman doğru yerdedir, dövüşecek animasyon kalmaz.
  let suppressSpyUntil = 0
  const scrollActiveIntoView = () => {
    if (!scrollMode.value) return
    const pg = store.pages[store.activePageIndex]
    const block = pg ? blockEls.get(pg.id) : undefined
    if (!block) return
    suppressSpyUntil = Date.now() + 700
    block.scrollIntoView({ block: 'nearest', behavior: 'auto' })
  }

  // Kaydırmalı modda sayfayı yerinde aktifleştir (görünüm kaymaz, canlı canvas taşınır).
  // Sayaç: hızlı ardışık aktivasyonlarda tek boolean yutuluyordu (ikinci gezinme
  // yanlışlıkla kaydırıyor / programatik gezinme kaydıramıyordu).
  let holdCount = 0
  const activatePageInPlace = (i: number) => {
    if (!scrollMode.value || i === store.activePageIndex) return
    holdCount++
    store.goToPage(i)
  }
  /** Watcher bir yerinde-aktivasyon jetonu varsa tüketir (kaydırma atlanır). */
  const takeHoldNav = (): boolean => {
    if (holdCount > 0) {
      holdCount--
      return true
    }
    return false
  }

  // Scroll bitince en görünür bloğu aktifleştir (sürekli mod beklentisi).
  // Debounce'lu: programatik kaydırma bitince hedef zaten aktif olduğundan no-op olur.
  let scrollTimer: ReturnType<typeof setTimeout> | undefined
  const runSpy = () => {
    scrollTimer = undefined
    if (!scrollMode.value || store.isDrawing || ps.spacePan()) return
    // Programatik kaydırma (uzun smooth dahil) yerleşene kadar spy kapalı;
    // süre dolmadıysa kalan süreye ertele, ara sayfaya takılma.
    const wait = suppressSpyUntil - Date.now()
    if (wait > 0) {
      if (scrollTimer) clearTimeout(scrollTimer)
      scrollTimer = setTimeout(runSpy, wait)
      return
    }
    const box = scrollBox.value
    if (!box) return
    const br = box.getBoundingClientRect()
    let best = -1
    let bestVis = 0
    for (let i = 0; i < store.pages.length; i++) {
      const pg = store.pages[i]
      if (!pg) continue
      const el = blockEls.get(pg.id)
      if (!el) continue
      const r = el.getBoundingClientRect()
      const vis = Math.max(0, Math.min(r.bottom, br.bottom) - Math.max(r.top, br.top))
      if (vis > bestVis) {
        bestVis = vis
        best = i
      }
    }
    if (best >= 0 && bestVis > 0) activatePageInPlace(best)
  }
  const onScrollBox = () => {
    if (scrollTimer) clearTimeout(scrollTimer)
    scrollTimer = setTimeout(runSpy, 150)
    refreshBlocks()
  }

  // Görünüm-çapalı zoom (Xournal++ usulü): imleç altındaki layout noktası
  // zoom boyunca sabit kalır. Boya-pan YOK — viewPan scroll modda daima sıfır.
  // Kayıt (zoom öncesi layout+scroll ile) ve uygulama (reflow sonrası ölçümle)
  // ayrı adımlardır; tek seferlik tüketilir.
  interface ViewZoomAnchor {
    blockId: string
    fracX: number
    fracY: number
    viewX: number
    viewY: number
  }
  let viewAnchor: ViewZoomAnchor | null = null

  const anchorViewZoom = (clientX: number, clientY: number) => {
    const box = scrollBox.value
    if (!box || !scrollMode.value) return
    const br = box.getBoundingClientRect()
    const viewX = clientX - br.left
    const viewY = clientY - br.top
    const contentX = box.scrollLeft + viewX
    const contentY = box.scrollTop + viewY
    // İmleç altındaki blok (boşluktaysa en yakın kenar, oran kelepçeli).
    let best: ViewZoomAnchor | null = null
    let bestDist = Infinity
    for (const pg of store.pages) {
      const el = blockEls.get(pg.id)
      if (!el || el.offsetWidth === 0 || el.offsetHeight === 0) continue
      const t = el.offsetTop
      const l = el.offsetLeft
      const w = el.offsetWidth
      const h = el.offsetHeight
      const dx = contentX < l ? l - contentX : contentX > l + w ? contentX - (l + w) : 0
      const dy = contentY < t ? t - contentY : contentY > t + h ? contentY - (t + h) : 0
      const d = dx * dx + dy * dy
      if (d < bestDist) {
        bestDist = d
        best = {
          blockId: pg.id,
          fracX: Math.min(1, Math.max(0, (contentX - l) / w)),
          fracY: Math.min(1, Math.max(0, (contentY - t) / h)),
          viewX,
          viewY,
        }
      }
    }
    viewAnchor = best
  }

  const applyViewZoomCompensation = () => {
    const a = viewAnchor
    viewAnchor = null
    if (!a || !scrollMode.value) return
    const box = scrollBox.value
    const el = blockEls.get(a.blockId)
    if (!box || !el || el.offsetWidth === 0 || el.offsetHeight === 0) return
    const maxTop = Math.max(0, box.scrollHeight - box.clientHeight)
    const maxLeft = Math.max(0, box.scrollWidth - box.clientWidth)
    box.scrollTop = Math.min(maxTop, Math.max(0, el.offsetTop + a.fracY * el.offsetHeight - a.viewY))
    box.scrollLeft = Math.min(maxLeft, Math.max(0, el.offsetLeft + a.fracX * el.offsetWidth - a.viewX))
    // Programatik yerleşme: spy ara sayfaya takılmasın (viewport-update ≠ navigation).
    // Pencere kısa (150ms spy debounce + pay): inişler artık anlık, 700ms'lik körlük
    // zoom sonrası kullanıcı kaydırmasını yutup sonra aniden sayfa atlatıyordu.
    suppressSpyUntil = Date.now() + 250
  }

  // Bloğa tıklama = o sayfada çalışmaya başla. Kaydırmayı bozmamak için
  // sürükleme eşiği var (dokunmatik kaydırmada pointercancel zaten keser).
  let blockTap: { x: number; y: number; id: number } | null = null
  const onBlockDown = (e: PointerEvent) => {
    blockTap = { x: e.clientX, y: e.clientY, id: e.pointerId }
  }
  const onBlockUp = (e: PointerEvent, i: number) => {
    const t = blockTap
    blockTap = null
    if (!t || t.id !== e.pointerId) return
    const dx = e.clientX - t.x
    const dy = e.clientY - t.y
    if (dx * dx + dy * dy > 64) return
    activatePageInPlace(i)
  }

  // Pasif sayfaların statik resmi (aktif sayfa canlı canvas'la gelir, atlanır).
  // Taze damgası: zoom+boyut anahtarıyla hangi bloğun güncel olduğu hatırlanır —
  // sayfa geçişlerinde TÜM pasifler değil, yalnızca bayat olan boyanır.
  const blockRenderKey = new Map<string, string>()
  let blockTimer: ReturnType<typeof setTimeout> | undefined
  const refreshBlocks = () => {
    if (!scrollMode.value) return
    if (blockTimer) clearTimeout(blockTimer)
    blockTimer = setTimeout(() => {
      blockTimer = undefined
      // Çizim sürerken pasif blokları yeniden render etme — bırakışa ertele.
      if (store.isDrawing) {
        refreshBlocks()
        return
      }
      let more = false
      try {
        const activeId = store.pages[store.activePageIndex]?.id
        // Statik resim zoom'u takip eder (bitmap tavanlı, canlı ile aynı ölçek hissi).
        const z = Math.min(2.5, Math.max(0.5, store.zoomFactor))
        const pages = store.pages.filter((p) => p.id !== activeId && blockEls.has(p.id))
        const box = scrollBox.value?.getBoundingClientRect()
        const visible = box
          ? pages.filter((p) => {
              const r = blockEls.get(p.id)?.getBoundingClientRect()
              return Boolean(r && r.bottom >= box.top - box.height && r.top <= box.bottom + box.height)
            })
          : pages
        const needsRender = visible.filter(
          (p) => blockRenderKey.get(p.id) !== `${z.toFixed(3)}:${p.size.w}x${p.size.h}`,
        )
        const batch = needsRender.slice(0, 2)
        more = needsRender.length > batch.length
        for (const p of batch) {
          const key = `${z.toFixed(3)}:${p.size.w}x${p.size.h}`
          const el = blockEls.get(p.id)
          if (!el) continue
          const c = store.exportPageToCanvas(p, p.size.w > 0 ? (860 / p.size.w) * z : 0.5)
          if (!c) continue
          c.className = 'block w-full h-auto'
          el.replaceChildren(c)
          blockRenderKey.set(p.id, key)
        }
        // Ölü id'leri temizle (silinen sayfalar).
        if (blockRenderKey.size > store.pages.length) {
          const alive = new Set(store.pages.map((pg) => pg.id))
          for (const k of [...blockRenderKey.keys()]) if (!alive.has(k)) blockRenderKey.delete(k)
        }
      } catch {
        /* boş blok */
      }
      if (more) refreshBlocks()
    }, 350)
  }

  const toggleScroll = async () => {
    cancelAllGestures()
    ps.clearActive()
    ps.clearPointers()
    scrollMode.value = !scrollMode.value
    store.setScrollLive(scrollMode.value)
    await nextTick()
    bindCanvases()
    if (scrollMode.value) {
      // Taze DOM: eski damgalar geçersiz, tüm pasifler ilk kez boyanır.
      blockRenderKey.clear()
      refreshBlocks()
      positionSlot()
      scrollActiveIntoView()
    }
    store.resizeCanvas()
    drawSelectionOverlay()
    updateHud(true)
  }

  const resetBlockTap = () => {
    blockTap = null
  }

  const cleanup = () => {
    if (blockTimer) clearTimeout(blockTimer)
    blockTimer = undefined
    if (scrollTimer) clearTimeout(scrollTimer)
    scrollTimer = undefined
    blockEls.clear()
    blockRenderKey.clear()
  }

  // Mürekkep yalnızca aktif sayfada değişir: pasif damgalar taze kalır,
  // yalnız aktif sayfanın damgası silinir (pasife düşünce boyanır).
  const stopBlockWatch = watch(
    () => store.thumbTick,
    () => {
      const activeId = store.pages[store.activePageIndex]?.id
      if (activeId) blockRenderKey.delete(activeId)
      refreshBlocks()
    },
  )

  onUnmounted(() => {
    stopBlockWatch()
    cleanup()
  })

  return {
    scrollMode,
    scrollBox,
    activeSlot,
    blockEls,
    setBlockRef,
    positionSlot,
    scrollActiveIntoView,
    activatePageInPlace,
    onScrollBox,
    onBlockDown,
    onBlockUp,
    refreshBlocks,
    toggleScroll,
    resetBlockTap,
    cleanup,
    takeHoldNav,
    anchorViewZoom,
    applyViewZoomCompensation,
  }
}
