import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { idbDeleteFile, idbGet, idbGetFile, idbGetKey, idbSet, idbSetFile, idbSetKey, SETTINGS_KEY, type PersistedDoc } from '../lib/idb'
import {
  cleanPaperBackground,
  DEFAULT_PAPER_BACKGROUND,
  dottedPoints,
  graphLineXs,
  marginLineX,
  ruledLineYs,
  staffLineYs,
  type PaperBackground,
  type PaperBackgroundType,
} from '../lib/paper'

export type Tool = 'pen' | 'eraser' | 'highlighter'
export interface Point { x: number; y: number; pressure?: number }
export interface Stroke {
  id: string
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

// Uygulama ayarları (çizimden ayrı anahtar; çizim silinse de durur).
// v1: kâğıt rengi + biçim; v2: + kâğıt deseni (background).
export type UiTheme = 'koyu' | 'acik'
export interface AppSettings {
  v: 1 | 2
  paper: string
  background?: PaperBackground
  format: PageFormat
  orientation: PageOrientation
  customW: number
  customH: number
  uiTheme: UiTheme
}

// A4 punto — boş sayfaların varsayılan boyutu.
export const A4 = { w: 595, h: 842 }

// Kâğıt temaları (ayarlar UI'ı buradan beslenir; esnek config'in ilk üyesi).
export const PAPER_THEMES = {
  gece: '#111827',
  siyah: '#000000',
  kagit: '#f5f1e8',
} as const
export type PaperTheme = keyof typeof PAPER_THEMES

// Sayfa biçimleri (punto, dikey). Yatayda en-boy yer değiştirir.
export const PAGE_FORMATS = {
  A4: { w: 595, h: 842 },
  A3: { w: 842, h: 1191 },
  A5: { w: 420, h: 595 },
  Letter: { w: 612, h: 792 },
} as const
export type PageFormat = keyof typeof PAGE_FORMATS | 'custom'
export type PageOrientation = 'portrait' | 'landscape'

// Sayfa arkaplan bitmap'leri: sayfa id → render edilmiş canvas. Persist edilmez,
// PDF bytes'larından yeniden üretilir. Aspect her zaman page.size ile aynıdır (inşa gereği).
const bgCanvases = new Map<string, HTMLCanvasElement>()

// Test edilebilir saf kural: ihtiyaç mevcudun %20 üstündeyse yeniden render et.
// (Sürekli üret-tüket döngüsüne girmemesi için histerezis şart.)
export const needsPdfRerender = (current: number, need: number): boolean =>
  Number.isFinite(current) &&
  Number.isFinite(need) &&
  current > 0 &&
  need > current * 1.2

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
  // Kâğıt rengi (ayar; esnek config'in ilk üyesi — tema/toolbar konumu vs. buraya eklenir).
  // PDF sayfalarında kâğıt YOKTUR (bitmap opak zaten) → şeffaf mod.
  const paper = ref<string>(PAPER_THEMES.gece)
  const setPaper = (hex: string) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return
    if (paper.value === hex) return
    paper.value = hex
    void persistSettings()
    // Base'de kâğıt dolgusu var → anında yeniden boya (canvas yoksa sessiz geç).
    if (canvasRef.value) {
      repaintBase()
      clearOverlay()
    }
  }
  // Kâğıt deseni (global v1; per-page override Faz 5'te). PDF sayfalarında çizilmez.
  const paperBackground = ref<PaperBackground>({ ...DEFAULT_PAPER_BACKGROUND })
  const setPaperBackground = (patch: Partial<PaperBackground>) => {
    const next = cleanPaperBackground({ ...paperBackground.value, ...patch })
    const cur = paperBackground.value
    if (
      cur.type === next.type &&
      cur.spacing === next.spacing &&
      cur.lineColor === next.lineColor &&
      cur.margin === next.margin &&
      cur.marginColor === next.marginColor
    )
      return
    paperBackground.value = next
    void persistSettings()
    if (canvasRef.value) {
      repaintBase()
      clearOverlay()
    }
  }
  // Sayfa için efektif kâğıt: PDF'li sayfada null (şeffaf mod).
  const paperFor = (page: Page): string | null =>
    page.pdfPageIndex !== undefined && page.pdfPageIndex !== null ? null : paper.value

  // Varsayılan sayfa biçimi (yeni sayfalar buradan doğar; açık sayfalar değişmez).
  const pageFormat = ref<PageFormat>('A4')
  const pageOrientation = ref<PageOrientation>('portrait')
  const customW = ref(595)
  const customH = ref(842)

  const defaultPageSize = (): { w: number; h: number } => {
    let base: { w: number; h: number }
    if (pageFormat.value === 'custom') {
      base = { w: customW.value, h: customH.value }
    } else {
      const f = PAGE_FORMATS[pageFormat.value] ?? PAGE_FORMATS.A4
      base = { w: f.w, h: f.h }
    }
    const w = Math.min(3000, Math.max(100, Math.round(base.w) || 595))
    const h = Math.min(3000, Math.max(100, Math.round(base.h) || 842))
    return pageOrientation.value === 'landscape' ? { w: h, h: w } : { w, h }
  }

  const setPageFormat = (f: string) => {
    if (f !== 'custom' && !(f in PAGE_FORMATS)) return
    pageFormat.value = f as PageFormat
    void persistSettings()
  }

  const setPageOrientation = (o: string) => {
    if (o !== 'portrait' && o !== 'landscape') return
    pageOrientation.value = o
    void persistSettings()
  }

  const setCustomSize = (w: number, h: number) => {
    if (!Number.isFinite(w) || !Number.isFinite(h)) return
    customW.value = Math.min(3000, Math.max(100, Math.round(w)))
    customH.value = Math.min(3000, Math.max(100, Math.round(h)))
    void persistSettings()
  }

  // Arayüz teması (koyu/açık chrome). <html data-theme> üzerinden CSS var'ları besler.
  const uiTheme = ref<UiTheme>('koyu')
  const applyUiTheme = () => {
    if (typeof document === 'undefined' || !document.documentElement) return
    document.documentElement.dataset.theme = uiTheme.value
  }
  const setUiTheme = (t: string) => {
    if (t !== 'koyu' && t !== 'acik') return
    if (uiTheme.value === t) return
    uiTheme.value = t
    applyUiTheme()
    void persistSettings()
  }

  const persistSettings = async (): Promise<void> => {
    try {
      const doc: AppSettings = {
        v: 2,
        paper: paper.value,
        background: { ...paperBackground.value },
        format: pageFormat.value,
        orientation: pageOrientation.value,
        customW: customW.value,
        customH: customH.value,
        uiTheme: uiTheme.value,
      }
      await idbSetKey(SETTINGS_KEY, doc)
    } catch {
      /* sessiz */
    }
  }

  // Ayar yedeği: indirilen JSON'u başka cihaza/tarayıcıya taşımak için.
  const exportSettingsJSON = (): string => {
    const doc: AppSettings = {
      v: 2,
      paper: paper.value,
      background: { ...paperBackground.value },
      format: pageFormat.value,
      orientation: pageOrientation.value,
      customW: customW.value,
      customH: customH.value,
      uiTheme: uiTheme.value,
    }
    return JSON.stringify(doc)
  }

  // Yedeği geri yükler: alan alan doğrular, geçerlileri uygular, tek persist.
  // En az bir alan uygulandıysa true döner.
  const importSettingsJSON = async (text: string): Promise<boolean> => {
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      return false
    }
    if (!raw || typeof raw !== 'object') return false
    const r = raw as Record<string, unknown>
    let applied = false
    const paperHex = r.paper
    if (typeof paperHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(paperHex)) {
      paper.value = paperHex
      applied = true
    }
    if ('background' in r && r.background !== undefined) {
      paperBackground.value = cleanPaperBackground(r.background)
      applied = true
    }
    const fmt = r.format
    if (fmt === 'custom' || (typeof fmt === 'string' && fmt in PAGE_FORMATS)) {
      pageFormat.value = fmt as PageFormat
      applied = true
    }
    if (r.orientation === 'portrait' || r.orientation === 'landscape') {
      pageOrientation.value = r.orientation
      applied = true
    }
    if (Number.isFinite(r.customW) && Number.isFinite(r.customH)) {
      customW.value = Math.min(3000, Math.max(100, Math.round(r.customW as number)))
      customH.value = Math.min(3000, Math.max(100, Math.round(r.customH as number)))
      applied = true
    }
    if (r.uiTheme === 'koyu' || r.uiTheme === 'acik') {
      uiTheme.value = r.uiTheme
      applied = true
    }
    if (!applied) return false
    applyUiTheme()
    await persistSettings()
    if (canvasRef.value) {
      repaintBase()
      clearOverlay()
    }
    return true
  }

  const loadSettings = async (): Promise<void> => {    try {
      const raw = await idbGetKey<AppSettings>(SETTINGS_KEY)
      if (!raw || (raw.v !== 1 && raw.v !== 2)) return
      if (typeof raw.paper === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.paper)) {
        paper.value = raw.paper
      }
      if (raw.v === 2 && raw.background !== undefined) {
        paperBackground.value = cleanPaperBackground(raw.background)
      }
      if (raw.format === 'custom' || (typeof raw.format === 'string' && raw.format in PAGE_FORMATS)) {
        pageFormat.value = raw.format as PageFormat
      }
      if (raw.orientation === 'portrait' || raw.orientation === 'landscape') {
        pageOrientation.value = raw.orientation
      }
      if (Number.isFinite(raw.customW) && Number.isFinite(raw.customH)) {
        customW.value = Math.min(3000, Math.max(100, Math.round(raw.customW)))
        customH.value = Math.min(3000, Math.max(100, Math.round(raw.customH)))
      }
      if (raw.uiTheme === 'koyu' || raw.uiTheme === 'acik') {
        uiTheme.value = raw.uiTheme
      }
      applyUiTheme()
    } catch {
      /* varsayılanlar */
    }
  }
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
  // Stroke kimliği: seçim/taşıma/kopyala'nın zemini. Sayfa id'sinden bağımsız sayaçlı.
  let strokeSeq = 0
  const newStrokeId = () =>
    `s-${Date.now().toString(36)}-${(strokeSeq++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
  const blankPage = (): Page => ({ id: newPageId(), strokes: [], size: defaultPageSize() })

  // View transform (non-reactive): aktif sayfa → ekran contain-fit.
  // Tüm giriş (getPos) ve çıkış (paint) bu uzaydan geçer; zoom/pan'in zemini.
  let viewScale = 1
  let viewOx = 0
  let viewOy = 0
  // Kullanıcı zoom/pan'i: fit'in ÜSTÜNE çarpılır (non-reactive; gesture'da reactive yazım yok).
  // UI etiketi ayrıca senkronlanır (zoomLabel), template sadece onu okur.
  let viewZoom = 1
  let viewPanX = 0
  let viewPanY = 0
  const zoomLabel = ref('100%')
  const ZOOM_MIN = 0.5
  const ZOOM_MAX = 8
  const effScale = () => (viewScale || 1) * viewZoom
  const effOx = () => viewOx * viewZoom + viewPanX
  const effOy = () => viewOy * viewZoom + viewPanY
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

  // --- Zoom / pan (pinch, ctrl-wheel, trackpad-kaydırma) ---
  const syncZoomLabel = () => {
    zoomLabel.value = `${Math.round(viewZoom * 100)}%`
  }

  const clampPan = () => {
    const c = canvasRef.value
    if (!c) return
    viewPanX = Math.min(c.clientWidth, Math.max(-c.clientWidth, viewPanX))
    viewPanY = Math.min(c.clientHeight, Math.max(-c.clientHeight, viewPanY))
  }

  // İç çekirdek: verilen ekran noktasının altındaki sayfa noktası sabit kalır.
  const applyZoomAt = (nz: number, cx: number, cy: number) => {
    const fs = viewScale || 1
    const es = fs * viewZoom
    const px = (cx - (viewOx * viewZoom + viewPanX)) / es
    const py = (cy - (viewOy * viewZoom + viewPanY)) / es
    viewZoom = nz
    viewPanX = cx - (px * fs * nz + viewOx * nz)
    viewPanY = cy - (py * fs * nz + viewOy * nz)
  }

  // İmleç/pinch-merkezi sabitli zoom. Tek repaint.
  const zoomBy = (factor: number, cx: number, cy: number) => {
    if (!(factor > 0) || !Number.isFinite(factor) || !Number.isFinite(cx) || !Number.isFinite(cy)) return
    const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, viewZoom * factor))
    if (nz === viewZoom) return
    applyZoomAt(nz, cx, cy)
    clampPan()
    syncZoomLabel()
    repaintBase()
    clearOverlay()
    scheduleRerender()
  }

  const panBy = (dx: number, dy: number) => {
    if ((!dx && !dy) || !Number.isFinite(dx) || !Number.isFinite(dy)) return
    viewPanX += dx
    viewPanY += dy
    clampPan()
    repaintBase()
    clearOverlay()
  }

  // Pinch gesture: tek repaint ile zoom + orta-nokta sürükleme.
  const pinch = (factor: number, midX: number, midY: number, dx: number, dy: number) => {
    if (!(factor > 0) || !Number.isFinite(factor)) return
    const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, viewZoom * factor))
    if (nz !== viewZoom && Number.isFinite(midX) && Number.isFinite(midY)) {
      applyZoomAt(nz, midX, midY)
    }
    if (Number.isFinite(dx) && Number.isFinite(dy)) {
      viewPanX += dx || 0
      viewPanY += dy || 0
    }
    clampPan()
    syncZoomLabel()
    repaintBase()
    clearOverlay()
    scheduleRerender()
  }

  const resetView = () => {
    viewZoom = 1
    viewPanX = 0
    viewPanY = 0
    syncZoomLabel()
    repaintBase()
    clearOverlay()
  }

  // Ekran merkezli kademeli zoom (butonlar için).
  const zoomStep = (factor: number) => {
    const c = canvasRef.value
    if (!c) return
    zoomBy(factor, c.clientWidth / 2, c.clientHeight / 2)
  }

  // Yarım çizgiyi çöpe at (gesture başlayınca yanlış nokta kalmasın — commit YOK).
  const cancelActiveStroke = () => {
    isDrawing.value = false
    points.value = []
    bb = null
    clearOverlay()
  }

  // Test/HUD için canlı view durumu (reaktiviteye dokunmaz).
  const getViewTransform = () => ({ scale: effScale(), ox: effOx(), oy: effOy(), zoom: viewZoom })

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

  // Sayfa-uzayı transform'u: DPR × efektif view-fit. Tüm boyama bu çatı altında yapılır.
  const applyView = (ctx: CanvasRenderingContext2D, fn: () => void) => {
    const d = dpr.value || getDPR()
    ctx.setTransform(d * effScale(), 0, 0, d * effScale(), d * effOx(), d * effOy())
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
    // Ekran-css → sayfa-pt (efektif fit'in tersi).
    const s = effScale() || 1
    return {
      x: (e.clientX - rect.left - effOx()) / s,
      y: (e.clientY - rect.top - effOy()) / s,
    }
  }

  const readPressure = (e: PointerEvent): number => {
    // mouse her zaman 1; stylus/touch basıncı yoksa nötr 0.5 (çizgi kaybolmasın)
    if (e.pointerType === 'mouse') return 1
    if (e.pressure && e.pressure > 0) return e.pressure
    return 0.5
  }

  // ✅ Başlat - basılı tutunca. rejectTouch'ta touch yok sayılır.
  // Sayfa DIŞINA basım yok sayılır (kenar dışı nokta tıklamasından mürekkep doğmaz).
  const startDrawing = (e: PointerEvent): boolean => {
    if (!canvasRef.value || isDrawing.value) return false
    if (shouldIgnoreEvent(e)) return false
    isDrawing.value = true

    const { x, y } = getPos(e)
    const size = activePage.value.size
    // Kenar toleransı: float/çizgi-kalınlığı payı (2 ekran-px). Ötesi ret, içi kelepçe.
    const m = 2 / (effScale() || 1)
    if (x < -m || y < -m || x > size.w + m || y > size.h + m) {
      isDrawing.value = false
      return false
    }
    const cx = Math.min(size.w, Math.max(0, x))
    const cy = Math.min(size.h, Math.max(0, y))
    const p = readPressure(e)
    lastPressure = p
    points.value = [{ x: cx, y: cy, pressure: p }]
    bb = { x0: cx, y0: cy, x1: cx, y1: cy }
    // Silgi ilk temasta base'e nokta koyar (overlay'de önizleme olmaz).
    if (currentTool.value === 'eraser') {
      paintEraserOnBase(points.value, strokeWidth.value, paperFor(activePage.value))
    }
    return true
  }

  // ✅ Çek - hareket ederken smooth çizim.
  // Desimasyon: saf mesafe filtresi (eşik ekran-px'ten sayfa uzayına çevrilir).
  // 1.5px'ten yakın noktalar path'i şişirir, görsel fark yaratmaz — atla.
  const MIN_DIST_SCREEN = 1.5
  const draw = (e: PointerEvent) => {
    if (!isDrawing.value || !canvasRef.value) return
    if (shouldIgnoreEvent(e)) return

    const raw = getPos(e)
    const size = activePage.value.size
    // Sayfa dışına taşan hareket kenara kelepçelenir (ekran/export tutarlılığı).
    const x = Math.min(size.w, Math.max(0, raw.x))
    const y = Math.min(size.h, Math.max(0, raw.y))
    const pressureVal = readPressure(e)
    lastPressure = pressureVal

    const pts = points.value
    const last = pts[pts.length - 1]
    if (last) {
      const dx = x - last.x
      const dy = y - last.y
      const minD = MIN_DIST_SCREEN / (effScale() || 1)
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
    if (currentTool.value === 'eraser') {
      paintEraserOnBase(pts, strokeWidth.value, paperFor(activePage.value))
    }
  }

  // Silgi overlay'de ÇALIŞMAZ (destination-out şeffaf katmanda görünmez).
  // Bu yüzden silgi doğrudan base'e inkremental işlenir: her yeni segment tek çizilir.
  // History'de normal stroke olarak durur → undo/resize replay ile tutarlı.
  // Kâğıt modunda silgi = kâğıt rengi boya (seam yok); şeffaf modda gerçek silme.
  const paintEraserOnBase = (pts: Point[], width: number, paperHex: string | null) => {
    if (pts.length === 0) return
    const ctx = getCtx(canvasRef.value)
    if (!ctx) return
    applyView(ctx, () => {
      ctx.save()
      applyStyleForStroke(ctx, 'eraser', '#000000', width, paperHex)
      if (pts.length === 1) {
        const p = pts[0]!
        ctx.beginPath()
        ctx.arc(p.x, p.y, Math.max(width / 2, 2.5), 0, Math.PI * 2)
        if (paperHex) {
          ctx.globalCompositeOperation = 'source-over'
          ctx.fillStyle = paperHex
        } else {
          ctx.globalCompositeOperation = 'destination-out'
          ctx.fillStyle = 'rgba(0,0,0,1)'
        }
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
        id: newStrokeId(),
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
          const paperHex = paperFor(activePage.value)
          applyView(ctx, () => paintStroke(ctx, stroke, paperHex))
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
    paperHex: string | null,
  ) => {
    if (tool === 'eraser') {
      if (paperHex) {
        // Kâğıt modu: silgi = kâğıt rengi boya (opak base, seam yok, undo tutarlı).
        ctx.globalCompositeOperation = 'source-over'
        ctx.strokeStyle = paperHex
        ctx.lineWidth = Math.max(w, 5)
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.globalAlpha = 1
      } else {
        // Şeffaf mod (PDF): gerçek silme.
        ctx.globalCompositeOperation = 'destination-out'
        ctx.strokeStyle = 'rgba(0, 0, 0, 1)'
        ctx.lineWidth = Math.max(w, 5)
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.globalAlpha = 1
      }
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
    paperHex: string | null,
  ) => {
    if (s.points.length === 0) return
    ctx.save()
    const w = s.tool === 'eraser' ? s.width : effectiveWidth(s.points, s.width)
    applyStyleForStroke(ctx, s.tool, s.color, w, paperHex)
    strokePath(ctx, s.points)
    ctx.stroke()
    // Tek nokta ise dolgu da yap ki görünsün
    if (s.points.length === 1) {
      const p = s.points[0]!
      ctx.beginPath()
      ctx.arc(p.x, p.y, Math.max(w / 2, 1), 0, Math.PI * 2)
      if (s.tool === 'eraser') {
        if (paperHex) {
          ctx.globalCompositeOperation = 'source-over'
          ctx.fillStyle = paperHex
        } else {
          ctx.globalCompositeOperation = 'destination-out'
          ctx.fillStyle = 'rgba(0,0,0,1)'
        }
      } else {
        ctx.fillStyle = s.tool === 'highlighter' ? hexToRgba(s.color, 0.5) : s.color
      }
      ctx.fill()
    }
    ctx.restore()
  }

  // Overlay'i temizle — fullscreen DEĞİL, aktif çizginin kirli kutusu + pay (sayfa uzayında).
  // Pay ekran-px'ten çevrilir ki zoom'da da yeterli kalsın.
  const DIRTY_PAD_SCREEN = 36
  const clearOverlay = () => {
    const ctx = getCtx(overlayRef.value)
    if (!ctx) return
    if (!bb) {
      clearLayer(ctx)
      return
    }
    // const'a al: closure içinde let-daralma kaybolur (TS18047).
    const box = bb
    const pad = DIRTY_PAD_SCREEN / (effScale() || 1)
    applyView(ctx, () => {
      ctx.clearRect(box.x0 - pad, box.y0 - pad, box.x1 - box.x0 + pad * 2, box.y1 - box.y0 + pad * 2)
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

  // Bir sayfayı verilen ctx'e çiz: kâğıt dolgusu + desen + arkaplan tam kanama + stroke'lar.
  // Transform dışarıda kurulur (ekran: view-fit, export: sayfa boyutu).
  // Desen SADECE boş sayfada: PDF bitmap'i varsa (veya kâğıt şeffafsa) çizilmez.
  const paintPaperPattern = (
    ctx: CanvasRenderingContext2D,
    page: Page,
    bg: PaperBackground,
  ) => {
    if (bg.type === 'blank' && !bg.margin) return
    if (bgCanvases.has(page.id)) return
    const { w, h } = page.size
    if (!(w > 0 && h > 0)) return
    ctx.save()
    ctx.strokeStyle = bg.lineColor
    ctx.fillStyle = bg.lineColor
    ctx.lineWidth = 1
    ctx.globalAlpha = 1
    const hline = (y: number, width = 1) => {
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }
    if (bg.type === 'ruled') {
      const ys = ruledLineYs(h, bg.spacing)
      ys.forEach((y, i) => hline(y, i % 5 === 4 ? 1.2 : 0.7))
    } else if (bg.type === 'graph') {
      const ys = ruledLineYs(h, bg.spacing)
      const xs = graphLineXs(w, bg.spacing)
      ys.forEach((y, i) => hline(y, i % 5 === 4 ? 1 : 0.5))
      ctx.lineWidth = 0.5
      xs.forEach((x, i) => {
        ctx.lineWidth = i % 5 === 4 ? 1 : 0.5
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
        ctx.stroke()
      })
    } else if (bg.type === 'dotted') {
      ctx.lineWidth = 1
      for (const p of dottedPoints(w, h, bg.spacing)) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 1.3, 0, Math.PI * 2)
        ctx.fill()
      }
    } else if (bg.type === 'staff') {
      for (const group of staffLineYs(h, bg.spacing)) {
        for (const y of group) hline(y, 0.9)
      }
    }
    if (bg.margin) {
      const mx = marginLineX(w)
      if (mx !== null) {
        ctx.strokeStyle = bg.marginColor
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(mx, 0)
        ctx.lineTo(mx, h)
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  const paintPage = (ctx: CanvasRenderingContext2D, page: Page) => {
    const paperHex = paperFor(page)
    if (paperHex) {
      ctx.fillStyle = paperHex
      ctx.fillRect(0, 0, page.size.w, page.size.h)
      paintPaperPattern(ctx, page, paperBackground.value)
    }
    const bg = bgCanvases.get(page.id)
    if (bg) ctx.drawImage(bg, 0, 0, page.size.w, page.size.h)
    for (const s of page.strokes) {
      paintStroke(ctx, s, paperHex)
    }
  }

  // Export sayfa boyutu = sayfanın kendi boyutu (bg'li: orijinal punto, boş: A4).
  // Ekran px'ini punto saymak 19 inçlik sayfalar üretirdi — jsPDF'e yön de şart
  // (belirtilmezse landscape içeriğe portrait MediaBox açıyor).
  const exportPageSize = (page: Page) => ({ w: page.size.w, h: page.size.h })

  // Export raster: sayfayı GERÇEK boyutunda çizer (~144dpi). Remap YOK —
  // mürekkep zaten sayfa uzayında, arkaplan tam kanama. Kâğıt varsa dolar, PDF modu şeffaf kalır.
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
      const paperHex = paperFor(activePage.value)
      applyView(ctx, () => {
        paintStroke(
          ctx,
          {
            tool: currentTool.value,
            color: color.value,
            width: strokeWidth.value,
            points: points.value,
          },
          paperHex,
        )
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

  // ✅ PNG dışa aktar: aktif sayfanın render'ı (kâğıt dahil; PDF modu şeffaf zemin).
  const exportDataURL = (): string => {
    const rendered = exportPageToCanvas(activePage.value)
    return rendered ? rendered.toDataURL('image/png') : ''
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

  // PDF kalite politikası: import'ta yüksek çözünürlük, zoom sonunda ihtiyaca göre yenile.
  const PDF_RENDER_BASE = 3
  const PDF_RENDER_MANY = 1.5
  const PDF_RENDER_MAX = 4
  const RERENDER_DELAY = 600
  // Açık PDF'in bytes'ları (yeniden render için bellekte; kapatınca silinir).
  let pdfBytesCache: Uint8Array | null = null
  // Sayfa id → bitmap'in render ölçeği (pt→bitmap px). İhtiyaç hesabının girdisi.
  const pdfRenderScales = new Map<string, number>()

  // Test edilebilir saf kural: ihtiyaç, mevcudun %20 üstündeyse yeniden render.
  const renderPdfPages = async (bytes: Uint8Array): Promise<{ rendered: RenderedPdfPage[]; scale: number }> => {
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
      // Tam boyut hamlesi: bitmap sayfa puntosunun katları (zoom'da erime payı).
      const scale = pdf.numPages > 30 ? PDF_RENDER_MANY : PDF_RENDER_BASE
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
      return { rendered: out, scale }
    } finally {
      // v6'da document destroy yok; cleanup sayfa kaynaklarını bırakır (worker yeniden kullanılır).
      await pdf.cleanup()
    }
  }

  // Tek sayfayı verilen ölçekte render et (zoom-sonu tazeleme yolu).
  const renderPdfPageAt = async (
    bytes: Uint8Array,
    index0: number,
    scale: number,
  ): Promise<RenderedPdfPage | null> => {
    const pdfjs = await import('pdfjs-dist')
    if (!workerReady) {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).href
      workerReady = true
    }
    const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise
    try {
      if (index0 < 0 || index0 >= pdf.numPages) return null
      const page = await pdf.getPage(index0 + 1)
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      return { canvas, cssW: viewport.width / scale, cssH: viewport.height / scale }
    } finally {
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
      const { rendered, scale } = await renderPdfPages(bytes)
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
      pdfRenderScales.clear()
      pdfBytesCache = new Uint8Array(stored)
      // Sayfa boyutu = PDF puntosu (bitmap aspect ile aynı, inşa gereği).
      pages.value = rendered.map((r) => ({ id: newPageId(), strokes: [], size: { w: r.cssW, h: r.cssH } }))
      rendered.forEach((r, i) => {
        const p = pages.value[i]!
        bgCanvases.set(p.id, r.canvas)
        pdfRenderScales.set(p.id, scale)
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
    } catch (e) {
      console.error('[calem] PDF import hatası:', e)
      return { error: `PDF açılamadı (${e instanceof Error ? e.message : 'bilinmiyor'})` }
    } finally {
      pdfBusy.value = false
    }
  }

  // PDF export: her sayfa GERÇEK boyutunda PNG'ye çevrilip tek PDF'e gömülür.
  // Üretim ve kaydetme ayrı (test edilebilirlik + hata ayrımı).
  const buildPdfDocument = async (): Promise<
    { doc: InstanceType<typeof import('jspdf').jsPDF>; pages: number } | { error: string }
  > => {
    // Not: busy kilidi çağrıda (exportPdf); burada tekrar kontrol YOK
    // (yoksa export kendini kilitler — gerçek vaka).
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

  // Konum + isim seçimli kayıt (File System Access API).
  // Dönüş: saved (picker ile yazıldı) / fallback (API yok, klasik indirme) /
  // cancelled (kullanıcı vazgeçti — hata DEĞİL, sessiz dönülür).
  const savePdfBlob = async (blob: Blob, fileName: string): Promise<'saved' | 'fallback' | 'cancelled'> => {
    const w = window as unknown as {
      showSaveFilePicker?: (opts: {
        suggestedName?: string
        types?: { description?: string; accept: Record<string, string[]> }[]
      }) => Promise<{
        createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }>
      }>
    }
    if (typeof w.showSaveFilePicker !== 'function') return 'fallback'
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: 'PDF belgesi', accept: { 'application/pdf': ['.pdf'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return 'saved'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      throw e
    }
  }

  const exportPdf = async (opts: { prompt?: boolean } = {}): Promise<
    { pages: number } | { error: string } | { cancelled: true }
  > => {
    if (pdfBusy.value) return { error: 'işlem sürüyor' }
    pdfBusy.value = true
    try {
      const built = await buildPdfDocument()
      if ('error' in built) return built
      const fileName = `calem-${new Date().toISOString().slice(0, 10)}.pdf`
      // Varsayılan: konum + isim sor. API yoksa (Firefox vb.) klasik indirme klasörü.
      if (opts.prompt !== false) {
        const how = await savePdfBlob(built.doc.output('blob'), fileName)
        if (how === 'saved') return { pages: built.pages }
        if (how === 'cancelled') return { cancelled: true }
      }
      built.doc.save(fileName)
      return { pages: built.pages }
    } catch (e) {
      console.error('[calem] PDF export hatası:', e)
      return { error: `PDF yazılamadı (${e instanceof Error ? e.message : 'bilinmiyor'})` }
    } finally {
      pdfBusy.value = false
    }
  }
  // PDF'i kapat: arkaplanlar gider, tek boş sayfaya dönülür, dosya kaydı silinir.
  const closePdf = () => {
    if (pdfId.value) void idbDeleteFile(pdfId.value).catch(() => {})
    bgCanvases.clear()
    pdfRenderScales.clear()
    pdfBytesCache = null
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
      pdfBytesCache = new Uint8Array(rec.bytes)
      const { rendered, scale } = await renderPdfPages(pdfBytesCache)
      for (const p of pages.value) {
        if (p.pdfPageIndex === undefined) continue
        const r = rendered[p.pdfPageIndex]
        if (r) {
          setPageBackground(p.id, r.canvas, p.pdfPageIndex)
          pdfRenderScales.set(p.id, scale)
        }
      }
    } catch {
      /* arkaplansız devam */
    }
  }

  // Zoom sonunda görünür sayfanın bitmap'i yetersizse yüksek çözünürlükte yenile.
  // Debounce'lu + async: gesture'i bloklamaz, sessiz başarısız olur.
  let rerenderTimer: ReturnType<typeof setTimeout> | undefined
  const scheduleRerender = () => {
    if (rerenderTimer) clearTimeout(rerenderTimer)
    rerenderTimer = setTimeout(() => {
      rerenderTimer = undefined
      void rerenderActivePageIfNeeded()
    }, RERENDER_DELAY)
  }

  const rerenderActivePageIfNeeded = async (): Promise<boolean> => {
    try {
      const page = activePage.value
      if (!pdfBytesCache || !canvasRef.value) return false
      if (page.pdfPageIndex === undefined) return false
      const need = effScale() * (dpr.value || getDPR())
      const current = pdfRenderScales.get(page.id) ?? 0
      if (!needsPdfRerender(current, need)) return false
      const target = Math.min(PDF_RENDER_MAX, need)
      const r = await renderPdfPageAt(pdfBytesCache, page.pdfPageIndex, target)
      if (!r) return false
      // Boyut PUNTO cinsinden sabit — sadece bitmap tazelenir (vektörler kıpırdamaz).
      setPageBackground(page.id, r.canvas, page.pdfPageIndex)
      pdfRenderScales.set(page.id, target)
      repaintBase()
      clearOverlay()
      return true
    } catch {
      return false
    }
  }

  // --- Autosave (IndexedDB, debounce'lu) ---
  let saveTimer: ReturnType<typeof setTimeout> | undefined

  const fmtTime = (t: number) =>
    new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })

  // Reactive proxy'leri düz veriye çevir — IDB structured-clone'a temiz girer.
  const snapshotStroke = (s: Stroke): Stroke => ({
    id: typeof s.id === 'string' && s.id ? s.id : newStrokeId(),
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
  // idsiz eski kayıtlar backfill alır (seçim çalışsın diye).
  const cleanStrokes = (input: Stroke[]): Stroke[] => {
    const clean: Stroke[] = []
    for (const s of input) {
      if (!s || !Array.isArray(s.points)) continue
      const pts = s.points.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      if (pts.length === 0) continue
      clean.push({
        id: typeof (s as Stroke).id === 'string' && (s as Stroke).id ? (s as Stroke).id : newStrokeId(),
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
    if (removed) {
      bgCanvases.delete(removed.id)
      pdfRenderScales.delete(removed.id)
    }
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
    paper,
    setPaper,
    paperBackground,
    setPaperBackground,
    loadSettings,
    pageFormat,
    pageOrientation,
    customW,
    customH,
    setPageFormat,
    setPageOrientation,
    setCustomSize,
    uiTheme,
    setUiTheme,
    exportSettingsJSON,
    importSettingsJSON,
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
    zoomLabel,
    zoomBy,
    panBy,
    pinch,
    resetView,
    zoomStep,
    cancelActiveStroke,
    getViewTransform,
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
