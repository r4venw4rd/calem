import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { idbDeleteFile, idbGet, idbGetFile, idbSet, idbSetFile, type PersistedDoc } from '../lib/idb'

export type Tool = 'pen' | 'eraser' | 'highlighter'
export interface Point { x: number; y: number; pressure?: number }
export interface Stroke {
  tool: Tool
  color: string
  width: number
  points: Point[]
}
export interface Page {
  id: string
  strokes: Stroke[]
  // PDF sayfa bitmap'inin CSS-px boyutu (oran için). Bitmap'in kendisi reaktivite-dışı
  // side-map'te (bgCanvases) durur — DOM objesi reactive state'e girmez.
  bgSize: { w: number; h: number } | null
  // Hangi PDF'in kaçıncı sayfası (0-based). Yeniden yüklemede arkaplanı bulmak için.
  pdfPageIndex?: number
}

// Sayfa arkaplan bitmap'leri: sayfa id → render edilmiş canvas. Persist edilmez,
// PDF bytes'larından yeniden üretilir (C2b).
const bgCanvases = new Map<string, HTMLCanvasElement>()

// Contain-fit: bitmap CSS boyutu + hedef CSS boyut → ölçek + offset.
const fitContain = (bw: number, bh: number, cssW: number, cssH: number) => {
  const scale = Math.min(cssW / bw, cssH / bh)
  const dw = bw * scale
  const dh = bh * scale
  return { scale, ox: (cssW - dw) / 2, oy: (cssH - dh) / 2, dw, dh }
}

export interface PerfStats {
  lastMs: number
  emaMs: number
  frameMs: number
  renders: number
  totalPoints: number
}

// Bilerek reaktivite DIŞI (modül seviyesi): her frame yazılır.
// Pinia state'i içinde olsaydı her yazım tüm store'u (tüm stroke'lar dahil)
// reaktivite/devtools hattından geçirir → çizgi sayısı arttıkça kasar.
export const drawingPerf: PerfStats = { lastMs: 0, emaMs: 0, frameMs: 0, renders: 0, totalPoints: 0 }

export const useDrawingStore = defineStore('drawing', () => {
  const canvasRef = ref<HTMLCanvasElement | null>(null)
  // Aktif çizgi katmanı — commit'lenmiş sahneye dokunmadan her frame sadece bu temizlenip çizilir.
  // Böylece per-frame maliyet O(tüm sahne) değil O(aktif çizgi) olur.
  const overlayRef = ref<HTMLCanvasElement | null>(null)
  const isDrawing = ref(false)
  // Hot path: her pointermove'da push — deep reactivity maliyeti olmasın diye shallow.
  const points = shallowRef<Point[]>([])
  // Hot-path state bilerek NON-reactive: her pointermove alt-event'inde yazılır, template okumaz.
  // Reactive olsaydı her yazım Pinia/devtools'a mutation olarak düşer → oturum uzadıkça kasar.
  let lastPressure = 1
  let cachedRect: DOMRect | null = null
  // Aktif çizginin kirli kutusu (CSS px) — overlay fullscreen değil, bu kutu temizlenir.
  let bb: { x0: number; y0: number; x1: number; y1: number } | null = null
  // Son bilinen CSS boyutu — resize'da arkaplanlı sayfaların vektörlerini orantılı ölçeklemek için.
  let lastCssW = 0
  let lastCssH = 0
  const color = ref('#ffffff')
  // Araç başına kalınlık hafızası: kalem ince, silgi kocaman olabilir; araç değişince geri gelir.
  const WIDTH_MIN: Record<Tool, number> = { pen: 1, highlighter: 1, eraser: 5 }
  const WIDTH_MAX: Record<Tool, number> = { pen: 20, highlighter: 50, eraser: 120 }
  const widths = ref<Record<Tool, number>>({ pen: 3, highlighter: 10, eraser: 24 })
  // Mevcut aracın kalınlığı — template ve çizim buradan okur (eski strokeWidth ile aynı isim).
  const strokeWidth = computed(() => widths.value[currentTool.value])
  const widthMin = computed(() => WIDTH_MIN[currentTool.value])
  const widthMax = computed(() => WIDTH_MAX[currentTool.value])
  const currentTool = ref<Tool>('pen')
  // 0 = basınç kapalı, 2 = çok hassas. UI slider'dan ayarlanır.
  const pressureSensitivity = ref(1)
  // Açıkken touch ile çizim engellenir (stylus + mouse serbest) — Chromebook avuç reddi.
  const rejectTouch = ref(false)
  // Backing-store ölçeği — noktalar CSS px cinsinden saklanır, render DPR ile ölçeklenir.
  // Böylece resize'da vektör geçmişi bozulmaz, hidpi'de bulanıklık olmaz.
  const dpr = ref(1)

  // --- Sayfa modeli (PDF çok-sayfa + sayfa şeridinin zemini) ---
  // Stroke'lar sayfalarda durur; tüm çizim op'ları AKTİF sayfaya işler.
  const newPageId = () =>
    `p-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
  const blankPage = (): Page => ({ id: newPageId(), strokes: [], bgSize: null })

  const pages = ref<Page[]>([blankPage()])
  const activePageIndex = ref(0)
  const activePage = computed(() => pages.value[activePageIndex.value] ?? pages.value[0]!)

  // Template uyumluluğu: store.strokes = aktif sayfanın çizgileri (salt-okunur görünüm).
  // Store içi yazımlar activePage.value.strokes üzerindendir.
  const strokes = computed(() => activePage.value.strokes)

  // Undo ile çıkanlar buraya; yeni çizgi VEYA sayfa değişimi öldürür.
  const redoStack = ref<Stroke[]>([])
  // Son başarılı autosave saati (HH:MM) — header göstergesi, nadiren yazılır.
  const lastSavedAt = ref('')

  // Silgi history'de durur (replay tutarlılığı için) ama "çizgi" sayılmaz — HUD/undo bunu kullanır.
  // Her zaman AKTİF sayfa sayılır.
  const drawingCount = computed(() => {
    let n = 0
    for (const s of activePage.value.strokes) if (s.tool !== 'eraser') n += 1
    return n
  })

  // Sayaçlar aktif sayfadan yeniden hesaplanır (nadir op'larda O(sayfa) — drift yok).
  const recountActive = () => {
    drawingPerf.totalPoints = activePage.value.strokes.reduce(
      (n, s) => n + (s.tool === 'eraser' ? 0 : s.points.length),
      0,
    )
  }

  // Tool change — highlighter artık rengi ezmez, seçili renk alpha ile kullanılır.
  const setTool = (tool: Tool) => {
    currentTool.value = tool
  }

  // Color change
  const setColor = (col: string) => {
    color.value = col
  }

  // Stroke width change — ilgili araca yazılır, aralığına kelepçelenir.
  const setStrokeWidth = (w: number) => {
    const t = currentTool.value
    widths.value[t] = Math.min(WIDTH_MAX[t], Math.max(WIDTH_MIN[t], Math.round(w)))
  }

  const setRejectTouch = (v: boolean) => {
    rejectTouch.value = v
  }

  const shouldIgnoreEvent = (e: PointerEvent): boolean => {
    if (rejectTouch.value && e.pointerType === 'touch') return true
    return false
  }

  // Canvas ref setter — DİKKAT: burada width/height sıfırlama YAPMA.
  // canvas.width atamak canvas'ı temizler, o yüzden sadece mount/resize'da boyutlanır.
  const setCanvasRef = (canvas: HTMLCanvasElement | null) => {
    canvasRef.value = canvas
  }

  const setOverlayRef = (canvas: HTMLCanvasElement | null) => {
    overlayRef.value = canvas
  }

  // Düşük gecikme: Chrome'da kompozitör senkronizasyonu atlanır (desteklemeyen görmezden gelir).
  const getCtx = (canvas: HTMLCanvasElement | null): CanvasRenderingContext2D | null => {
    if (!canvas) return null
    return canvas.getContext('2d', { desynchronized: true }) as CanvasRenderingContext2D | null
  }

  // DPR transform'unu uygula ve CSS-px uzayında çalıştır.
  const withDpr = (ctx: CanvasRenderingContext2D, fn: () => void) => {
    const scale = dpr.value || getDPR()
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    fn()
  }

  const clearFull = (ctx: CanvasRenderingContext2D) => {
    withDpr(ctx, () => {
      ctx.clearRect(0, 0, ctx.canvas.width / (dpr.value || getDPR()), ctx.canvas.height / (dpr.value || getDPR()))
    })
  }

  const getDPR = () => Math.min(window.devicePixelRatio || 1, 2)

  // Backing store'u CSS boyut x DPR yap. Boyut değiştiyse true döner.
  const setupBackingStoreFor = (canvas: HTMLCanvasElement | null): boolean => {
    if (!canvas) return false
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (w === 0 || h === 0) return false
    const scale = getDPR()
    dpr.value = scale
    const bw = Math.round(w * scale)
    const bh = Math.round(h * scale)
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw
      canvas.height = bh
      return true
    }
    return false
  }

  // İlk kurulum + resize için tek giriş noktası: iki katmanı boyutlandır, base'i vektörden çiz.
  const setupCanvas = () => {
    cachedRect = null
    bb = null
    setupBackingStoreFor(canvasRef.value)
    setupBackingStoreFor(overlayRef.value)
    if (canvasRef.value) {
      lastCssW = canvasRef.value.clientWidth
      lastCssH = canvasRef.value.clientHeight
    }
    repaintBase()
    clearOverlay()
  }

  const getPos = (e: PointerEvent) => {
    const canvas = overlayRef.value ?? canvasRef.value
    if (!canvas) return { x: 0, y: 0 }
    // Stroke boyunca layout sabit (overflow hidden) → rect'i bir kez al, her alt-event'te
    // getBoundingClientRect çağırıp sync-layout'e zorlama.
    if (!cachedRect) cachedRect = canvas.getBoundingClientRect()
    const rect = cachedRect
    // Noktalar CSS px cinsinden saklanır — DPR sadece render transform'unda uygulanır.
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  const readPressure = (e: PointerEvent): number => {
    // mouse her zaman 1; stylus/touch basıncı yoksa nötr 0.5 (çizgi kaybolmasın)
    if (e.pointerType === 'mouse') return 1
    if (e.pressure && e.pressure > 0) return e.pressure
    return 0.5
  }

  // ✅ Başlat - basılı tutunca. rejectTouch'ta touch yok sayılır.
  const startDrawing = (e: PointerEvent): boolean => {
    if (!canvasRef.value || isDrawing.value) return false
    if (shouldIgnoreEvent(e)) return false
    isDrawing.value = true

    const { x, y } = getPos(e)
    const p = readPressure(e)
    lastPressure = p
    points.value = [{ x, y, pressure: p }]
    bb = { x0: x, y0: y, x1: x, y1: y }
    // Silgi ilk temasta base'e nokta koyar (overlay'de önizleme olmaz).
    if (currentTool.value === 'eraser') paintEraserOnBase(points.value, strokeWidth.value)
    return true
  }

  // ✅ Çek - hareket ederken smooth çizim.
  // Desimasyon: saf mesafe filtresi. 1.25px'ten yakın noktalar path'i şişirir,
  // görsel fark yaratmaz — atla. (Basınç ortalamayla genişliğe işlediği için
  // noktasal basınç farkı için nokta tutmak sadece history'yi şişirirdi.)
  const MIN_DIST = 1.5
  const draw = (e: PointerEvent) => {
    if (!isDrawing.value || !canvasRef.value) return
    if (shouldIgnoreEvent(e)) return

    const { x, y } = getPos(e)
    const pressureVal = readPressure(e)
    lastPressure = pressureVal

    const pts = points.value
    const last = pts[pts.length - 1]
    if (last) {
      const dx = x - last.x
      const dy = y - last.y
      if (dx * dx + dy * dy < MIN_DIST * MIN_DIST) return
    }
    pts.push({ x, y, pressure: pressureVal })
    if (bb) {
      if (x < bb.x0) bb.x0 = x
      else if (x > bb.x1) bb.x1 = x
      if (y < bb.y0) bb.y0 = y
      else if (y > bb.y1) bb.y1 = y
    }
    // Silgi: yeni segmenti hemen base'e işle (overlay bypass).
    if (currentTool.value === 'eraser') paintEraserOnBase(pts, strokeWidth.value)
  }

  // Silgi overlay'de ÇALIŞMAZ (destination-out şeffaf katmanda görünmez).
  // Bu yüzden silgi doğrudan base'e inkremental işlenir: her yeni segment tek çizilir.
  // History'de normal stroke olarak durur → undo/resize replay ile tutarlı.
  const paintEraserOnBase = (pts: Point[], width: number) => {
    if (pts.length === 0) return
    const ctx = getCtx(canvasRef.value)
    if (!ctx) return
    withDpr(ctx, () => {
      ctx.save()
      applyStyleForStroke(ctx, 'eraser', '#000000', width)
      if (pts.length === 1) {
        const p = pts[0]!
        ctx.beginPath()
        ctx.arc(p.x, p.y, Math.max(width / 2, 2.5), 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(0,0,0,1)'
        ctx.fill()
      } else {
        const a = pts[pts.length - 2]!
        const b = pts[pts.length - 1]!
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
      ctx.restore()
    })
  }

  // ✅ Bitti — stroke'u geçmişe kaydet ve base katmanına bir kez işle (overlay temizlenir).
  // Silgi zaten çizilirken base'e işlendiği için tekrar boyanmaz (idempotent olurdu ama gereksiz).
  const stopDrawing = () => {
    if (isDrawing.value && points.value.length > 0) {
      const stroke: Stroke = {
        tool: currentTool.value,
        color: color.value,
        width: strokeWidth.value,
        points: [...points.value],
      }
      activePage.value.strokes.push(stroke)
      // Yeni mürekkep redo'yu öldürür.
      redoStack.value = []
      recountActive()
      if (stroke.tool !== 'eraser') {
        const ctx = getCtx(canvasRef.value)
        if (ctx) {
          withDpr(ctx, () => paintStroke(ctx, stroke))
        }
      }
      scheduleSave()
    }
    isDrawing.value = false
    points.value = []
    clearOverlay()
    bb = null
  }

  const hexToRgba = (hex: string, alpha: number): string => {
    const h = hex.replace('#', '')
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
    const n = parseInt(full, 16)
    if (Number.isNaN(n)) return `rgba(255,255,0,${alpha})`
    const r = (n >> 16) & 255
    const g = (n >> 8) & 255
    const b = n & 255
    return `rgba(${r},${g},${b},${alpha})`
  }

  const applyStyleForStroke = (
    ctx: CanvasRenderingContext2D,
    tool: Tool,
    col: string,
    w: number,
  ) => {
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0, 0, 0, 1)'
      ctx.lineWidth = Math.max(w, 5)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.globalAlpha = 1
    } else if (tool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = hexToRgba(col, 0.5)
      ctx.lineWidth = Math.max(w * 2.5, 8)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.globalAlpha = 0.5
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = col
      ctx.lineWidth = Math.max(w, 1)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.globalAlpha = 0.95
    }
  }

  // ✅ Catmull-Rom spline ile smooth path (verilen noktalar için)
  const strokePath = (ctx: CanvasRenderingContext2D, pts: Point[]) => {
    if (pts.length === 1) {
      const p = pts[0]!
      // Tek nokta = nokta koy (tıklayıp bırakma durumu)
      ctx.beginPath()
      ctx.arc(p.x, p.y, 0.1, 0, Math.PI * 2)
      // arc tek başına stroke ile görünmez olabilir, o yüzden lineTo trick:
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x + 0.1, p.y + 0.1)
      return
    }
    if (pts.length < 2) return

    ctx.beginPath()
    const p0 = pts[0]!
    ctx.moveTo(p0.x, p0.y)

    for (let i = 0; i < pts.length - 1; i++) {
      const p0ref = i > 0 ? pts[i - 1]! : pts[i]!
      const p1 = pts[i]!
      const p2 = pts[i + 1]!
      const p3 = pts[i + 2] || p2

      const tension = 0.5
      const cp1x = p1.x + ((p2.x - p0ref.x) / 6) * tension
      const cp1y = p1.y + ((p2.y - p0ref.y) / 6) * tension
      const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension
      const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y)
    }
  }

  // Basınç ortalamasından efektif genişlik: sensitivity=0 → basınç yok sayılır.
  const effectiveWidth = (pts: Point[], base: number): number => {
    if (pressureSensitivity.value <= 0 || pts.length === 0) return base
    let sum = 0
    for (const p of pts) sum += p.pressure ?? 1
    const avg = sum / pts.length
    const pressureFactor = 0.4 + 0.6 * Math.min(Math.max(avg, 0), 1)
    const w = base * (1 + (pressureFactor - 1) * Math.min(pressureSensitivity.value, 2))
    return Math.max(w, 0.5)
  }

  const paintStroke = (
    ctx: CanvasRenderingContext2D,
    s: Pick<Stroke, 'tool' | 'color' | 'width' | 'points'>,
  ) => {
    if (s.points.length === 0) return
    ctx.save()
    const w = s.tool === 'eraser' ? s.width : effectiveWidth(s.points, s.width)
    applyStyleForStroke(ctx, s.tool, s.color, w)
    strokePath(ctx, s.points)
    ctx.stroke()
    // Tek nokta ise dolgu da yap ki görünsün
    if (s.points.length === 1) {
      const p = s.points[0]!
      ctx.beginPath()
      ctx.arc(p.x, p.y, Math.max(w / 2, 1), 0, Math.PI * 2)
      ctx.fillStyle = s.tool === 'highlighter' ? hexToRgba(s.color, 0.5) : s.color
      ctx.fill()
    }
    ctx.restore()
  }

  // Overlay'i temizle — fullscreen DEĞİL, aktif çizginin kirli kutusu + pay.
  // Fullscreen clearRect DPR2'de ~8M px doldurur; zayıf iGPU'da her frame ödenmez.
  const DIRTY_PAD = 36
  const clearOverlay = () => {
    const ctx = getCtx(overlayRef.value)
    if (!ctx) return
    withDpr(ctx, () => {
      if (!bb) {
        const s = dpr.value || getDPR()
        ctx.clearRect(0, 0, ctx.canvas.width / s, ctx.canvas.height / s)
        return
      }
      ctx.clearRect(bb.x0 - DIRTY_PAD, bb.y0 - DIRTY_PAD, bb.x1 - bb.x0 + DIRTY_PAD * 2, bb.y1 - bb.y0 + DIRTY_PAD * 2)
    })
  }

  // Base katmanını geçmişten baştan çiz — sadece undo/clear/resize/setup'ta çalışır (nadir).
  const repaintBase = () => {
    const ctx = getCtx(canvasRef.value)
    if (!ctx || !canvasRef.value) return
    clearFull(ctx)
    withDpr(ctx, () => {
      paintPage(ctx, activePage.value, canvasRef.value!.clientWidth, canvasRef.value!.clientHeight)
    })
  }

  // Bir sayfayı verilen ctx'e çiz: arkaplan (contain-fit) + stroke'lar. Transform dışarıda kurulur.
  const paintPage = (ctx: CanvasRenderingContext2D, page: Page, cssW: number, cssH: number) => {
    const bg = bgCanvases.get(page.id)
    if (bg && page.bgSize) {
      const f = fitContain(page.bgSize.w, page.bgSize.h, cssW, cssH)
      ctx.drawImage(bg, f.ox, f.oy, f.dw, f.dh)
    }
    for (const s of page.strokes) {
      paintStroke(ctx, s)
    }
  }

  // Export için: sayfayı verilen canvas'a tam boy çiz (opak zemin + arkaplan + mürekkep).
  const renderPageToCanvas = (page: Page, canvas: HTMLCanvasElement, cssW: number, cssH: number) => {
    const ctx = getCtx(canvas)
    if (!ctx) return false
    const scale = dpr.value || getDPR()
    canvas.width = Math.max(1, Math.round(cssW * scale))
    canvas.height = Math.max(1, Math.round(cssH * scale))
    withDpr(ctx, () => {
      ctx.fillStyle = EXPORT_BG
      ctx.fillRect(0, 0, cssW, cssH)
      paintPage(ctx, page, cssW, cssH)
    })
    return true
  }

  // Arkaplan ata (PDF import yolu). Eski bitmap varsa ezilir.
  const setPageBackground = (
    pageId: string,
    bmp: HTMLCanvasElement,
    cssW: number,
    cssH: number,
    pdfPageIndex?: number,
  ) => {
    bgCanvases.set(pageId, bmp)
    const p = pages.value.find((x) => x.id === pageId)
    if (p) {
      p.bgSize = { w: cssW, h: cssH }
      if (pdfPageIndex !== undefined) p.pdfPageIndex = pdfPageIndex
    }
  }

  const clearPageBackground = (pageId: string) => {
    bgCanvases.delete(pageId)
    const p = pages.value.find((x) => x.id === pageId)
    if (p) {
      p.bgSize = null
      delete p.pdfPageIndex
    }
  }

  // ✅ Aktif çizgiyi overlay'e çiz — per-frame tek maliyet bu (O(aktif çizgi), sahneden bağımsız).
  // Silgi overlay kullanmaz (doğrudan base'e işlenir) → burada iş yok.
  const renderActiveStroke = () => {
    if (currentTool.value === 'eraser') return
    const t0 = performance.now()
    const ctx = getCtx(overlayRef.value)
    if (!ctx) return
    clearFull(ctx)
    if (isDrawing.value && points.value.length > 0) {
      withDpr(ctx, () => {
        paintStroke(ctx, {
          tool: currentTool.value,
          color: color.value,
          width: strokeWidth.value,
          points: points.value,
        })
      })
    }
    const dt = performance.now() - t0
    drawingPerf.lastMs = dt
    drawingPerf.emaMs = drawingPerf.emaMs === 0 ? dt : drawingPerf.emaMs * 0.9 + dt * 0.1
    drawingPerf.renders += 1
  }

  // Geriye uyumluluk: ctx'li eski çağrılar overlay/base'e yönlenir (ctx argümanı yok sayılır).
  const renderCurrentStroke = (_ctx?: CanvasRenderingContext2D) => {
    renderActiveStroke()
  }

  const redraw = (_ctx?: CanvasRenderingContext2D) => {
    repaintBase()
    renderActiveStroke()
  }

  // ✅ Canvası render et (dışarıdan çağrılan)
  const renderAllStrokes = (_ctx?: CanvasRenderingContext2D) => {
    repaintBase()
    renderActiveStroke()
  }

  // ✅ Canvası temizle — sadece AKTİF sayfa (sayfalar varken global silme yok).
  const clearCanvas = () => {
    activePage.value.strokes = []
    redoStack.value = []
    points.value = []
    recountActive()
    isDrawing.value = false
    cachedRect = null
    bb = null
    const ctx = getCtx(canvasRef.value)
    if (ctx) clearFull(ctx)
    clearOverlay()
    scheduleSave()
  }

  // Ekranla birebir koyu zemin — beyaz kalem export'ta da görünür kalır.
  // (Şeffaf bırakılırsa PNG görüntüleyicide satranç tahtası/şeffaf açılır.)
  const EXPORT_BG = '#111827'

  // ✅ Görüntü verisi dışa aktar (opak zemin + base + overlay kompoze)
  const exportDataURL = (): string => {
    if (!canvasRef.value) return ''
    const base = canvasRef.value
    const overlay = overlayRef.value
    const tmp = document.createElement('canvas')
    tmp.width = base.width
    tmp.height = base.height
    const tctx = tmp.getContext('2d')
    if (!tctx) return base.toDataURL('image/png')
    tctx.fillStyle = EXPORT_BG
    tctx.fillRect(0, 0, tmp.width, tmp.height)
    tctx.drawImage(base, 0, 0)
    if (overlay) tctx.drawImage(overlay, 0, 0, tmp.width, tmp.height)
    return tmp.toDataURL('image/png')
  }

  // ✅ Görüntü verisi al
  const getImageData = (): ImageData => {
    if (!canvasRef.value) return new ImageData(1, 1)
    return (
      canvasRef.value?.getContext('2d')?.getImageData(0, 0, canvasRef.value.width, canvasRef.value.height) ||
      new ImageData(1, 1)
    )
  }

  // ✅ Pressure sensitivity ayarla (0..2 aralığına kelepçele)
  const setPressureSensitivity = (val: number) => {
    pressureSensitivity.value = Math.min(2, Math.max(0, val))
  }

  // --- PDF (çok sayfalı import, arkaplanlar sayfa bitmap'i olur) ---
  // pdf.js/jspdf DİNAMİK import edilir — ilk yüklemeye ~1MB eklenmez, PDF'e dokununca gelir.
  const pdfBusy = ref(false)
  const pdfId = ref<string | null>(null)
  const pdfName = ref('')
  let workerReady = false

  interface RenderedPdfPage {
    canvas: HTMLCanvasElement
    cssW: number
    cssH: number
  }

  const renderPdfPages = async (bytes: Uint8Array): Promise<RenderedPdfPage[]> => {
    const pdfjs = await import('pdfjs-dist')
    if (!workerReady) {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).href
      workerReady = true
    }
    const pdf = await pdfjs.getDocument({ data: bytes }).promise
    try {
      // Çok sayfada bellek patlamasın diye ölçek düşer (30+ sayfa → 1x).
      const scale = pdf.numPages > 30 ? 1 : 1.5
      const out: RenderedPdfPage[] = []
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        const ctx = canvas.getContext('2d')
        if (!ctx) continue
        await page.render({ canvas, canvasContext: ctx, viewport }).promise
        out.push({ canvas, cssW: viewport.width / scale, cssH: viewport.height / scale })
      }
      return out
    } finally {
      // v6'da document destroy yok; cleanup sayfa kaynaklarını bırakır (worker yeniden kullanılır).
      await pdf.cleanup()
    }
  }

  // PDF açar: sayfaları değiştirir (component önceden confirm sorar).
  const importPdf = async (file: File): Promise<{ pages: number } | { error: string }> => {
    if (pdfBusy.value) return { error: 'işlem sürüyor' }
    const looksPdf = file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')
    if (!looksPdf) return { error: 'PDF dosyası seç' }
    pdfBusy.value = true
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      // pdf.js worker'a taşırken buffer'ı detach edebilir — IDB kopyası ÖNCE alınır.
      const stored = bytes.slice().buffer
      const rendered = await renderPdfPages(bytes)
      if (rendered.length === 0) return { error: 'sayfa yok' }
      const id = `${file.name}::${file.size}::${file.lastModified}`
      // Önce dosyayı persist et: başarısızsa mevcut sahne korunur.
      await idbSetFile({
        id,
        name: file.name,
        size: file.size,
        addedAt: Date.now(),
        pageCount: rendered.length,
        bytes: stored,
      })
      if (pdfId.value && pdfId.value !== id) {
        void idbDeleteFile(pdfId.value).catch(() => {})
      }
      bgCanvases.clear()
      pages.value = rendered.map((r) => ({ id: newPageId(), strokes: [], bgSize: { w: r.cssW, h: r.cssH } }))
      rendered.forEach((r, i) => {
        const p = pages.value[i]!
        bgCanvases.set(p.id, r.canvas)
        p.pdfPageIndex = i
      })
      pdfId.value = id
      pdfName.value = file.name
      activePageIndex.value = 0
      redoStack.value = []
      points.value = []
      isDrawing.value = false
      bb = null
      recountActive()
      repaintBase()
      clearOverlay()
      scheduleSave()
      return { pages: rendered.length }
    } catch {
      return { error: 'PDF açılamadı' }
    } finally {
      pdfBusy.value = false
    }
  }

  // PDF export: her sayfa PNG'ye çevrilip tek PDF'e gömülür (WYSIWYG).
  const exportPdf = async (): Promise<{ pages: number } | { error: string }> => {
    if (pdfBusy.value) return { error: 'işlem sürüyor' }
    const base = canvasRef.value
    if (!base || pages.value.length === 0) return { error: 'sayfa yok' }
    pdfBusy.value = true
    try {
      const { jsPDF } = await import('jspdf')
      const cssW = base.clientWidth || 800
      const cssH = base.clientHeight || 600
      const doc = new jsPDF({ unit: 'pt', format: [cssW, cssH], compress: true })
      const tmp = document.createElement('canvas')
      for (let i = 0; i < pages.value.length; i++) {
        if (i > 0) doc.addPage([cssW, cssH])
        if (!renderPageToCanvas(pages.value[i]!, tmp, cssW, cssH)) {
          return { error: `sayfa ${i + 1} çizilemedi` }
        }
        doc.addImage(tmp.toDataURL('image/png'), 'PNG', 0, 0, cssW, cssH)
      }
      doc.save(`calem-${new Date().toISOString().slice(0, 10)}.pdf`)
      return { pages: pages.value.length }
    } catch {
      return { error: 'PDF yazılamadı' }
    } finally {
      pdfBusy.value = false
    }
  }
  // PDF'i kapat: arkaplanlar gider, tek boş sayfaya dönülür, dosya kaydı silinir.
  const closePdf = () => {
    if (pdfId.value) void idbDeleteFile(pdfId.value).catch(() => {})
    bgCanvases.clear()
    pdfId.value = null
    pdfName.value = ''
    pages.value = [blankPage()]
    activePageIndex.value = 0
    redoStack.value = []
    points.value = []
    isDrawing.value = false
    bb = null
    recountActive()
    repaintBase()
    clearOverlay()
    scheduleSave()
  }

  // Açılışta arkaplanları PDF bytes'larından yeniden üretir (sessiz başarısızlık: mürekkep durur).
  const restorePdfBackgrounds = async (id: string): Promise<void> => {
    try {
      const rec = await idbGetFile(id)
      if (!rec) return
      const rendered = await renderPdfPages(new Uint8Array(rec.bytes))
      for (const p of pages.value) {
        if (p.pdfPageIndex === undefined) continue
        const r = rendered[p.pdfPageIndex]
        if (r) setPageBackground(p.id, r.canvas, r.cssW, r.cssH, p.pdfPageIndex)
      }
    } catch {
      /* arkaplansız devam */
    }
  }

  // --- Autosave (IndexedDB, debounce'lu) ---
  let saveTimer: ReturnType<typeof setTimeout> | undefined

  const fmtTime = (t: number) =>
    new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })

  // Reactive proxy'leri düz veriye çevir — IDB structured-clone'a temiz girer.
  const snapshotStroke = (s: Stroke): Stroke => ({
    tool: s.tool,
    color: s.color,
    width: s.width,
    points: s.points.map((p) => ({ x: p.x, y: p.y, pressure: p.pressure })),
  })

  const persistNow = async (): Promise<void> => {
    try {
      const now = Date.now()
      const doc: PersistedDoc = {
        v: 2,
        savedAt: now,
        pages: pages.value.map((p) => ({
          id: p.id,
          strokes: p.strokes.map(snapshotStroke),
          bgSize: null,
          ...(p.pdfPageIndex !== undefined ? { pdfPageIndex: p.pdfPageIndex } : {}),
        })),
        widths: { ...widths.value },
        activePageIndex: activePageIndex.value,
        ...(pdfId.value ? { pdfId: pdfId.value, pdfName: pdfName.value } : {}),
      }
      await idbSet(doc)
      lastSavedAt.value = fmtTime(now)
    } catch {
      // Özel mod / IDB kapalı: sessizce vazgeç (çizim bellekte sürer).
    }
  }

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = undefined
      void persistNow()
    }, 800)
  }

  // Bozuk kayda karşı stroke doğrulama (v1/v2 yükleme ortak).
  const cleanStrokes = (input: Stroke[]): Stroke[] => {
    const clean: Stroke[] = []
    for (const s of input) {
      if (!s || !Array.isArray(s.points)) continue
      const pts = s.points.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      if (pts.length === 0) continue
      clean.push({
        tool: s.tool === 'eraser' || s.tool === 'highlighter' ? s.tool : 'pen',
        color: typeof s.color === 'string' ? s.color : '#ffffff',
        width: typeof s.width === 'number' ? Math.min(120, Math.max(1, s.width)) : 3,
        points: pts.map((p) => ({ x: p.x, y: p.y, pressure: p.pressure })),
      })
    }
    return clean
  }

  // Açılışta kayıtlı sahneyi yükler. Canvas ref'leri hazır olduktan sonra çağrılmalı.
  // v1 (tek sayfa) kayıtları tek sayfaya göçer.
  const loadPersisted = async (): Promise<boolean> => {
    let doc: PersistedDoc | null = null
    try {
      doc = await idbGet()
    } catch {
      return false
    }
    if (!doc || typeof doc.v !== 'number') return false
    // widths her sürümde ortak
    const w = (doc as { widths?: unknown }).widths as Record<string, unknown> | undefined
    if (w) {
      for (const t of ['pen', 'highlighter', 'eraser'] as const) {
        const v = w[t]
        if (typeof v === 'number' && Number.isFinite(v)) {
          widths.value[t] = Math.min(WIDTH_MAX[t], Math.max(WIDTH_MIN[t], Math.round(v)))
        }
      }
    }
    let loaded: Page[] | null = null
    if (doc.v === 2 && Array.isArray(doc.pages)) {
      const clean = doc.pages
        .filter((p) => p && Array.isArray(p.strokes))
        .map((p) => ({
          id: typeof p.id === 'string' && p.id ? p.id : newPageId(),
          strokes: cleanStrokes(p.strokes),
          bgSize: null as Page['bgSize'],
          pdfPageIndex:
            typeof p.pdfPageIndex === 'number' && Number.isFinite(p.pdfPageIndex)
              ? Math.floor(p.pdfPageIndex)
              : undefined,
        }))
      loaded = clean.length > 0 ? clean : null
    } else if (doc.v === 1 && Array.isArray((doc as { strokes?: unknown }).strokes)) {
      const v1 = (doc as unknown as { strokes: Stroke[] }).strokes
      const clean = cleanStrokes(v1)
      loaded = clean.length > 0 ? [{ id: newPageId(), strokes: clean, bgSize: null }] : null
    }
    if (!loaded || loaded.length === 0) return false
    pages.value = loaded
    redoStack.value = []
    const idx = (doc as { activePageIndex?: unknown }).activePageIndex
    activePageIndex.value =
      typeof idx === 'number' && Number.isFinite(idx)
        ? Math.min(loaded.length - 1, Math.max(0, Math.floor(idx)))
        : 0
    // PDF kaydı varsa arkaplanları bytes'tan yeniden üret (yoksa mürekkep tek başına durur).
    if (doc.v === 2 && doc.pdfId) {
      pdfId.value = doc.pdfId
      pdfName.value = doc.pdfName ?? ''
      await restorePdfBackgrounds(doc.pdfId)
    } else {
      pdfId.value = null
      pdfName.value = ''
    }
    recountActive()
    lastSavedAt.value = fmtTime(doc.savedAt)
    repaintBase()
    return true
  }

  // ✅ Son stroke'u geri al (undo) — aktif sayfada
  const undoLastStroke = () => {
    const popped = activePage.value.strokes.pop()
    if (popped) redoStack.value.push(popped)
    points.value = []
    isDrawing.value = false
    repaintBase()
    clearOverlay()
    bb = null
    recountActive()
    scheduleSave()
  }

  // ✅ Yinele (redo) — undo ile çıkan en son stroke'u geri koyar (aktif sayfada).
  const redo = (): boolean => {
    const s = redoStack.value.pop()
    if (!s) return false
    activePage.value.strokes.push(s)
    recountActive()
    repaintBase()
    scheduleSave()
    return true
  }

  // --- Sayfa op'ları ---
  const goToPage = (i: number) => {
    const clamped = Math.min(pages.value.length - 1, Math.max(0, Math.floor(i)))
    if (clamped === activePageIndex.value) return
    activePageIndex.value = clamped
    // Sayfa değişimi redo'yu öldürür (global stack sayfalar arası taşınmaz).
    redoStack.value = []
    points.value = []
    isDrawing.value = false
    bb = null
    repaintBase()
    clearOverlay()
    recountActive()
    scheduleSave()
  }

  const addPage = () => {
    pages.value.push(blankPage())
    goToPage(pages.value.length - 1)
    scheduleSave()
  }

  // Silinen aktifse komşuya geçilir. Son sayfa silinemez. Veri kaybına karşı
  // component confirm() sorar (undo sayfa silişini geri getirmez).
  const deletePage = (i: number): boolean => {
    if (pages.value.length <= 1) return false
    const clamped = Math.min(pages.value.length - 1, Math.max(0, Math.floor(i)))
    const [removed] = pages.value.splice(clamped, 1)
    if (removed) bgCanvases.delete(removed.id)
    redoStack.value = []
    if (clamped < activePageIndex.value) {
      activePageIndex.value -= 1
    } else if (activePageIndex.value >= pages.value.length) {
      activePageIndex.value = pages.value.length - 1
    }
    points.value = []
    isDrawing.value = false
    bb = null
    repaintBase()
    clearOverlay()
    recountActive()
    scheduleSave()
    return true
  }

  // Arkaplanlı sayfaların vektörlerini yeni fit'e orantılı ölçekle (contain uniform olduğu için tek oran).
  const refitBackgrounds = (prevW: number, prevH: number, newW: number, newH: number) => {
    if (!prevW || !prevH || !newW || !newH || (prevW === newW && prevH === newH)) return
    for (const page of pages.value) {
      if (!page.bgSize || !bgCanvases.has(page.id)) continue
      const oldF = fitContain(page.bgSize.w, page.bgSize.h, prevW, prevH)
      const newF = fitContain(page.bgSize.w, page.bgSize.h, newW, newH)
      if (!oldF.scale) continue
      const r = newF.scale / oldF.scale
      if (!Number.isFinite(r) || r === 1) continue
      for (const s of page.strokes) {
        for (const p of s.points) {
          p.x *= r
          p.y *= r
        }
      }
    }
  }

  // ✅ Canvas boyutlarını yeniden hesapla — vektör geçmişi CSS px olduğu için
  // bitmap kopyaya gerek yok, sadece iki katmanı güncelle ve base'i redraw yap.
  const resizeCanvas = () => {
    cachedRect = null
    bb = null
    const prevW = lastCssW
    const prevH = lastCssH
    setupBackingStoreFor(canvasRef.value)
    setupBackingStoreFor(overlayRef.value)
    if (canvasRef.value) {
      const newW = canvasRef.value.clientWidth
      const newH = canvasRef.value.clientHeight
      refitBackgrounds(prevW, prevH, newW, newH)
      lastCssW = newW
      lastCssH = newH
    }
    repaintBase()
    renderActiveStroke()
  }

  // HUD için: aktif çizgideki nokta sayısı (reaktiviteye dokunmadan okunur).
  const activePoints = (): number => points.value.length

  return {
    canvasRef,
    overlayRef,
    isDrawing,
    color,
    strokeWidth,
    widths,
    widthMin,
    widthMax,
    currentTool,
    pressureSensitivity,
    rejectTouch,
    strokes,
    drawingCount,
    pages,
    activePage,
    activePageIndex,
    goToPage,
    addPage,
    deletePage,
    setPageBackground,
    clearPageBackground,
    renderPageToCanvas,
    dpr,
    setTool,
    setColor,
    setStrokeWidth,
    setRejectTouch,
    setCanvasRef,
    setOverlayRef,
    setupCanvas,
    activePoints,
    startDrawing,
    draw,
    stopDrawing,
    renderActiveStroke,
    repaintBase,
    clearOverlay,
    renderCurrentStroke,
    renderAllStrokes,
    redraw,
    clearCanvas,
    exportDataURL,
    getImageData,
    setPressureSensitivity,
    persistNow,
    loadPersisted,
    lastSavedAt,
    undoLastStroke,
    redo,
    redoStack,
    pdfBusy,
    pdfId,
    pdfName,
    importPdf,
    closePdf,
    exportPdf,
    resizeCanvas,
  }
})
