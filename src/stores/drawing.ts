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
  // Sayfanın mantıksal boyutu (punto). Çizgiler BU uzayda saklanır: ekrandan, DPR'dan
  // ve resize'dan bağımsız. Boş sayfa A4, PDF sayfası orijinal punto.
  size: { w: number; h: number }
  // Hangi PDF'in kaçıncı sayfası (0-based). Yeniden yüklemede arkaplanı bulmak için.
  pdfPageIndex?: number
}

// A4 punto — boş sayfaların varsayılan boyutu.
export const A4 = { w: 595, h: 842 }

// Sayfa arkaplan bitmap'leri: sayfa id → render edilmiş canvas. Persist edilmez,
// PDF bytes'larından yeniden üretilir. Aspect her zaman page.size ile aynıdır (inşa gereği).
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
  // Aktif çizginin kirli kutusu (SAYFA uzayında) — overlay fullscreen değil, bu kutu temizlenir.
  let bb: { x0: number; y0: number; x1: number; y1: number } | null = null
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
  // Backing-store ölçeği — noktalar SAYFA uzayında saklanır, render DPR × view-fit ile ölçeklenir.
  // Resize/ekran değişiminde vektörler kıpırdamaz (orantı hep fit'ten gelir).
  const dpr = ref(1)

  // --- Sayfa modeli (PDF çok-sayfa + sayfa şeridinin zemini) ---
  // Stroke'lar sayfalarda durur; tüm çizim op'ları AKTİF sayfaya işler.
  const newPageId = () =>
    `p-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
  const blankPage = (): Page => ({ id: newPageId(), strokes: [], size: { ...A4 } })

  // View transform (non-reactive): aktif sayfa → ekran contain-fit.
  // Tüm giriş (getPos) ve çıkış (paint) bu uzaydan geçer; zoom/pan'in zemini.
  let viewScale = 1
  let viewOx = 0
  let viewOy = 0
  const layoutView = () => {
    const canvas = canvasRef.value
    const page = activePage.value
    if (!canvas || !page || !(page.size.w > 0) || !(page.size.h > 0)) {
      viewScale = 1
      viewOx = 0
      viewOy = 0
      return
    }
    const f = fitContain(page.size.w, page.size.h, canvas.clientWidth, canvas.clientHeight)
    viewScale = f.scale || 1
    viewOx = f.ox
    viewOy = f.oy
  }

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
  // Bulunan kayıtlı oturum özeti — OTOMATİK YÜKLENMEZ, kullanıcı banner'dan seçer.
  const savedSession = ref<{ when: string; pages: number; strokes: number } | null>(null)

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

  // Sayfa-uzayı transform'u: DPR × view-fit. Tüm boyama bu çatı altında yapılır.
  const applyView = (ctx: CanvasRenderingContext2D, fn: () => void) => {
    const d = dpr.value || getDPR()
    ctx.setTransform(d * viewScale, 0, 0, d * viewScale, d * viewOx, d * viewOy)
    fn()
  }

  // Katmanı tamamen temizle (transform'suz, backing-boyutta).
  const clearLayer = (ctx: CanvasRenderingContext2D) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
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

  // Vektörler SAYFA uzayında sabit durur — resize sadece fit'i yeniler, nokta ölçeklenmez.
  // İlk kurulum + resize için tek giriş noktası: iki katmanı boyutlandır, view'u kur, base'i çiz.
  const setupCanvas = () => {
    cachedRect = null
    bb = null
    setupBackingStoreFor(canvasRef.value)
    setupBackingStoreFor(overlayRef.value)
    layoutView()
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
    // Ekran-css → sayfa-pt (contain-fit'in tersi).
    const s = viewScale || 1
    return {
      x: (e.clientX - rect.left - viewOx) / s,
      y: (e.clientY - rect.top - viewOy) / s,
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
  // Desimasyon: saf mesafe filtresi (eşik ekran-px'ten sayfa uzayına çevrilir).
  // 1.5px'ten yakın noktalar path'i şişirir, görsel fark yaratmaz — atla.
  const MIN_DIST_SCREEN = 1.5
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
      const minD = MIN_DIST_SCREEN / (viewScale || 1)
      if (dx * dx + dy * dy < minD * minD) return
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
    applyView(ctx, () => {
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
          applyView(ctx, () => paintStroke(ctx, stroke))
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

  // Overlay'i temizle — fullscreen DEĞİL, aktif çizginin kirli kutusu + pay (sayfa uzayında).
  const DIRTY_PAD = 36
  const clearOverlay = () => {
    const ctx = getCtx(overlayRef.value)
    if (!ctx) return
    applyView(ctx, () => {
      if (!bb) {
        const s = dpr.value || getDPR()
        ctx.clearRect(0, 0, ctx.canvas.width / s, ctx.canvas.height / s)
        return
      }
      ctx.clearRect(bb.x0 - DIRTY_PAD, bb.y0 - DIRTY_PAD, bb.x1 - bb.x0 + DIRTY_PAD * 2, bb.y1 - bb.y0 + DIRTY_PAD * 2)
    })
  }

  // Base katmanını geçmişten baştan çiz — sadece undo/clear/resize/setup/sayfa geçişinde (nadir).
  const repaintBase = () => {
    const ctx = getCtx(canvasRef.value)
    if (!ctx) return
    clearLayer(ctx)
    applyView(ctx, () => {
      paintPage(ctx, activePage.value)
    })
  }

  // Bir sayfayı verilen ctx'e çiz: arkaplan tam kanama (aspect inşa gereği aynı) + stroke'lar.
  // Transform dışarıda kurulur (ekran: view-fit, export: sayfa boyutu).
  const paintPage = (ctx: CanvasRenderingContext2D, page: Page) => {
    const bg = bgCanvases.get(page.id)
    if (bg) ctx.drawImage(bg, 0, 0, page.size.w, page.size.h)
    for (const s of page.strokes) {
      paintStroke(ctx, s)
    }
  }

  // Export sayfa boyutu = sayfanın kendi boyutu (bg'li: orijinal punto, boş: A4).
  // Ekran px'ini punto saymak 19 inçlik sayfalar üretirdi — jsPDF'e yön de şart
  // (belirtilmezse landscape içeriğe portrait MediaBox açıyor).
  const exportPageSize = (page: Page) => ({ w: page.size.w, h: page.size.h })

  // Export raster: sayfayı GERÇEK boyutunda çizer (~144dpi). Remap YOK —
  // mürekkep zaten sayfa uzayında, arkaplan tam kanama.
  const EXPORT_SCALE = 2
  const exportPageToCanvas = (page: Page): HTMLCanvasElement | null => {
    const { w, h } = page.size
    if (!(w > 0 && h > 0)) return null
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w * EXPORT_SCALE))
    canvas.height = Math.max(1, Math.round(h * EXPORT_SCALE))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.setTransform(EXPORT_SCALE, 0, 0, EXPORT_SCALE, 0, 0)
    ctx.fillStyle = EXPORT_BG
    ctx.fillRect(0, 0, w, h)
    paintPage(ctx, page)
    return canvas
  }

  // Arkaplan ata (PDF import yolu). Sayfa boyutu çağrıda hazır olur; bitmap aspect'i
  // sayfa aspect'iyle aynı olmalı (render ölçeği uniform).
  const setPageBackground = (pageId: string, bmp: HTMLCanvasElement, pdfPageIndex?: number) => {
    bgCanvases.set(pageId, bmp)
    const p = pages.value.find((x) => x.id === pageId)
    if (p && pdfPageIndex !== undefined) p.pdfPageIndex = pdfPageIndex
  }

  const clearPageBackground = (pageId: string) => {
    bgCanvases.delete(pageId)
    const p = pages.value.find((x) => x.id === pageId)
    if (p) delete p.pdfPageIndex
  }

  // ✅ Aktif çizgiyi overlay'e çiz — per-frame tek maliyet bu (O(aktif çizgi), sahneden bağımsız).
  // Silgi overlay kullanmaz (doğrudan base'e işlenir) → burada iş yok.
  const renderActiveStroke = () => {
    if (currentTool.value === 'eraser') return
    const t0 = performance.now()
    const ctx = getCtx(overlayRef.value)
    if (!ctx) return
    clearOverlay()
    if (isDrawing.value && points.value.length > 0) {
      applyView(ctx, () => {
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
    if (ctx) clearLayer(ctx)
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
      // Sayfa boyutu = PDF puntosu (bitmap aspect ile aynı, inşa gereği).
      pages.value = rendered.map((r) => ({ id: newPageId(), strokes: [], size: { w: r.cssW, h: r.cssH } }))
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
      layoutView()
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

  // PDF export: her sayfa GERÇEK boyutunda PNG'ye çevrilip tek PDF'e gömülür.
  // Üretim ve kaydetme ayrı (test edilebilirlik + hata ayrımı).
  const buildPdfDocument = async (): Promise<
    { doc: InstanceType<typeof import('jspdf').jsPDF>; pages: number } | { error: string }
  > => {
    if (pdfBusy.value) return { error: 'işlem sürüyor' }
    if (pages.value.length === 0) return { error: 'sayfa yok' }
    const { jsPDF } = await import('jspdf')
    let doc: InstanceType<typeof jsPDF> | undefined
    for (let i = 0; i < pages.value.length; i++) {
      const page = pages.value[i]!
      const { w, h } = page.size
      if (!(w > 0 && h > 0)) return { error: `sayfa ${i + 1} geçersiz` }
      const orientation = w >= h ? 'landscape' : 'portrait'
      if (!doc) {
        doc = new jsPDF({ unit: 'pt', format: [w, h], orientation, compress: true })
      } else {
        doc.addPage([w, h], orientation)
      }
      const rendered = exportPageToCanvas(page)
      if (!rendered) return { error: `sayfa ${i + 1} çizilemedi` }
      doc.addImage(rendered.toDataURL('image/png'), 'PNG', 0, 0, w, h)
    }
    return { doc: doc!, pages: pages.value.length }
  }

  const exportPdf = async (): Promise<{ pages: number } | { error: string }> => {
    if (pdfBusy.value) return { error: 'işlem sürüyor' }
    pdfBusy.value = true
    try {
      const built = await buildPdfDocument()
      if ('error' in built) return built
      built.doc.save(`calem-${new Date().toISOString().slice(0, 10)}.pdf`)
      return { pages: built.pages }
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
    layoutView()
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
        if (r) setPageBackground(p.id, r.canvas, p.pdfPageIndex)
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
          size: { w: p.size.w, h: p.size.h },
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

  // Eski kayıtlarda size yok: bgSize (PDF) varsa o, yoksa o anki ekran boyutu
  // (eski çizgiler 1:1 korunur — aynı ekranda görünüm değişmez).
  const pageSizeOf = (
    raw: { size?: unknown; bgSize?: unknown },
    fallback: { w: number; h: number },
  ) => {
    const s = raw.size as { w?: unknown; h?: unknown } | undefined
    if (s && typeof s.w === 'number' && typeof s.h === 'number' && s.w > 0 && s.h > 0) {
      return { w: s.w, h: s.h }
    }
    const b = raw.bgSize as { w?: unknown; h?: unknown } | undefined
    if (b && typeof b.w === 'number' && typeof b.h === 'number' && b.w > 0 && b.h > 0) {
      return { w: b.w, h: b.h }
    }
    return { ...fallback }
  }

  // Açılışta SADECE bakılır, yüklenmez: kayıtlı oturum varsa banner için özet döner.
  // Boş kayıt (çizgisiz) oturum sayılmaz — her açılışta banner çıkmasın diye.
  const checkSavedSession = async (): Promise<boolean> => {
    let doc: PersistedDoc | null = null
    try {
      doc = await idbGet()
    } catch {
      savedSession.value = null
      return false
    }
    if (!doc || typeof doc.v !== 'number') {
      savedSession.value = null
      return false
    }
    let pages = 0
    let strokes = 0
    if (doc.v === 2 && Array.isArray(doc.pages)) {
      pages = doc.pages.length
      for (const p of doc.pages) {
        if (p && Array.isArray(p.strokes)) strokes += p.strokes.length
      }
    } else if (doc.v === 1 && Array.isArray((doc as { strokes?: unknown }).strokes)) {
      pages = 1
      strokes = (doc as unknown as { strokes: unknown[] }).strokes.length
    }
    if (strokes === 0) {
      savedSession.value = null
      return false
    }
    savedSession.value = {
      when: fmtTime(typeof doc.savedAt === 'number' ? doc.savedAt : Date.now()),
      pages,
      strokes,
    }
    return true
  }

  const dismissSavedSession = () => {
    savedSession.value = null
  }

  // Açılışta kayıtlı sahneyi yükler (SADECE banner'dan çağrılır — otomatik değil).
  // Canvas ref'leri hazır olduktan sonra çağrılmalı. v1 kayıtları tek sayfaya göçer.
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
    const viewFallback = {
      w: canvasRef.value?.clientWidth || 800,
      h: canvasRef.value?.clientHeight || 600,
    }
    if (doc.v === 2 && Array.isArray(doc.pages)) {
      const clean = doc.pages
        .filter((p) => p && Array.isArray(p.strokes))
        .map((p) => ({
          id: typeof p.id === 'string' && p.id ? p.id : newPageId(),
          strokes: cleanStrokes(p.strokes),
          size: pageSizeOf(p, viewFallback),
          pdfPageIndex:
            typeof p.pdfPageIndex === 'number' && Number.isFinite(p.pdfPageIndex)
              ? Math.floor(p.pdfPageIndex)
              : undefined,
        }))
      loaded = clean.length > 0 ? clean : null
    } else if (doc.v === 1 && Array.isArray((doc as { strokes?: unknown }).strokes)) {
      const v1 = (doc as unknown as { strokes: Stroke[] }).strokes
      const clean = cleanStrokes(v1)
      loaded = clean.length > 0 ? [{ id: newPageId(), strokes: clean, size: { ...viewFallback } }] : null
    }
    if (!loaded || loaded.length === 0) return false
    pages.value = loaded
    savedSession.value = null
    redoStack.value = []
    const idx = (doc as { activePageIndex?: unknown }).activePageIndex
    activePageIndex.value =
      typeof idx === 'number' && Number.isFinite(idx)
        ? Math.min(loaded.length - 1, Math.max(0, Math.floor(idx)))
        : 0
    layoutView()
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
    layoutView()
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
    layoutView()
    repaintBase()
    clearOverlay()
    recountActive()
    scheduleSave()
    return true
  }

  // ✅ Canvas boyutlarını yeniden hesapla. Vektörler SAYFA uzayında sabit —
  // resize sadece view-fit'i yeniler, nokta ölçekleme YOK (refit tarihe karıştı).
  const resizeCanvas = () => {
    cachedRect = null
    bb = null
    setupBackingStoreFor(canvasRef.value)
    setupBackingStoreFor(overlayRef.value)
    layoutView()
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
    exportPageToCanvas,
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
    checkSavedSession,
    dismissSavedSession,
    savedSession,
    lastSavedAt,
    undoLastStroke,
    redo,
    redoStack,
    pdfBusy,
    pdfId,
    pdfName,
    importPdf,
    closePdf,
    buildPdfDocument,
    exportPdf,
    resizeCanvas,
  }
})
