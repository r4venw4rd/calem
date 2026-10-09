import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { storage, SETTINGS_KEY, type ImageFileRecord, type PersistedDoc } from '../lib/idb'
import {
  cleanPaperBackground,
  dottedPoints,
  graphLineXs,
  marginLineX,
  ruledLineYs,
  staffLineYs,
  type PaperBackground,
  type PaperBackgroundType,
} from '../lib/paper'
import {
  coalescedOf,
  selectByLasso as selByLasso,
  selectByRect as selByRect,
  strokeBBox,
} from '../lib/select'
import { splitRunsOutside } from '../lib/erase'
import { calemFileName, pdfFileName } from '../config/files'
import { ALL_TOOLS, DEFAULT_WIDTHS, WIDTH_MAX, WIDTH_MIN } from '../config/tools'
import { A4, DEFAULT_PAPER_BACKGROUND, PAGE_FORMATS, PAPER_THEMES } from '../config/paper'
import type { PageFormat, PageOrientation, PaperTheme } from '../config/paper'
import {
  B64_CHUNK,
  DIRTY_PAD_SCREEN,
  DPR_CAP,
  EXPORT_SCALE,
  FALLBACK_VIEWPORT,
  HISTORY_CAP,
  IMAGE_MAX_DIM,
  JPEG_QUALITY,
  MIN_DIST_SCREEN,
  PAGE_MAX,
  PAGE_MIN,
  PDF_MANY_THRESHOLD,
  PDF_RENDER_BASE,
  PDF_RENDER_MANY,
  PDF_RENDER_MAX,
  RERENDER_DELAY,
  SAVE_DELAY,
  ZOOM_MAX,
  ZOOM_MIN,
} from '../config/engine'
import {
  CUSTOM_SLOT_COUNT,
  DEFAULT_PALETTES,
  PALETTE_MAX_COLORS,
  PALETTE_MAX_COUNT,
} from '../config/palettes'
import { DEFAULT_LOCALE, isLocale, type Locale } from '../config/locale'

export type Tool = 'pen' | 'eraser' | 'highlighter' | 'select' | 'line' | 'rect' | 'ellipse' | 'arrow' | 'text' | 'image' | 'hand'
export type ShapeTool = 'line' | 'rect' | 'ellipse' | 'arrow'
// Şekil araçları: serbest path değil, ilk+son noktadan primitif çizilir.
export const isShapeTool = (t: Tool): t is ShapeTool =>
  t === 'line' || t === 'rect' || t === 'ellipse' || t === 'arrow'
export interface ToolbarConfig {
  order: Tool[]
  hidden: Tool[]
}
export type SelectMode = 'rect' | 'lasso'
// Renk paletleri: kayıtlı setler, aktif olanı toolbar'da dizilir.
// Her paletin kendi custom satırı vardır (palet değişince customs da değişir).
export interface ColorPalette {
  id: string
  name: string
  colors: string[]
  customs: string[]
}
export interface Point { x: number; y: number; pressure?: number }
// Çizgi stili: kalem + şekillerde kesikli/noktalı ve opaklık. Vurgu/silgi sabit stillidir.
export type DashStyle = 'solid' | 'dash' | 'dot'
export interface Stroke {
  id: string
  tool: Tool
  color: string
  width: number
  dash: DashStyle
  opacity: number
  points: Point[]
}
// Metin kutusu (sayfa-uzayı pt; x,y sol-üst). Çok satır \n ile.
export interface TextItem {
  id: string
  x: number
  y: number
  text: string
  color: string
  size: number
}
export const TEXT_SIZE_MIN = 8
export const TEXT_SIZE_MAX = 120
// Resim kutusu (sayfa-uzayı pt; x,y sol-üst). Piksel bytes IDB files deposunda,
// burada sadece referans durur (oturum external dosya gibidir).
export interface ImageItem {
  id: string
  x: number
  y: number
  w: number
  h: number
  fileId: string
}
// Katman (Faz 5): mürekkep katmanlarda durur. Metin/resim sayfa-seviyesidir (v1 kısıtı).
// layers[0] en alttır; görünmez katman boyanmaz ve seçime girmez (seçim aktif katmandadır).
export interface Layer {
  id: string
  name: string
  visible: boolean
  strokes: Stroke[]
}
export interface Page {
  id: string
  layers: Layer[]
  activeLayerId: string
  texts: TextItem[]
  images: ImageItem[]
  // Sayfanın mantıksal boyutu (punto). Çizgiler BU uzayda saklanır: ekrandan, DPR'dan
  // ve resize'dan bağımsız. Boş sayfa A4, PDF sayfası orijinal punto.
  size: { w: number; h: number }
  // Hangi PDF'in kaçıncı sayfası (0-based). Yeniden yüklemede arkaplanı bulmak için.
  pdfPageIndex?: number
}

// Uygulama ayarları (çizimden ayrı anahtar; çizim silinse de durur).
// v1: kâğıt rengi + biçim; v2: + kâğıt deseni; v3: + silgi modu; v4: + toolbar; v5: + locale + el silginin sağında.
export type UiTheme = 'koyu' | 'acik'
export type EraserMode = 'standard' | 'stroke'
export interface AppSettings {
  v: 1 | 2 | 3 | 4 | 5
  paper: string
  background?: PaperBackground
  eraserMode?: EraserMode
  toolbar?: ToolbarConfig
  smoothing?: number
  touchPan?: boolean
  palettes?: ColorPalette[]
  activePaletteId?: string
  customColors?: string[]
  format: PageFormat
  orientation: PageOrientation
  customW: number
  customH: number
  uiTheme: UiTheme
  locale?: Locale
}

// .calem aktarım dosyası: vektör belge + ayar + gömülü bytes (base64).
// IDB'nin taşınabilir hali; sürüm dosya biçimini kilitler (v1).
export interface CalemFile {
  app: 'calem'
  v: 1
  savedAt: number
  settings: AppSettings
  doc: {
    pages: Page[]
    widths?: Record<string, unknown>
    activePageIndex?: number
    pdfId?: string
    pdfName?: string
  }
  files: Record<
    string,
    { kind: 'image' | 'pdf'; name: string; w?: number; h?: number; pageCount?: number; b64: string }
  >
}

// A4 punto — boş sayfaların varsayılan boyutu.
// Sayfa arkaplan bitmap'leri: sayfa id → render edilmiş canvas. Persist edilmez,
// PDF bytes'larından yeniden üretilir. Aspect her zaman page.size ile aynıdır (inşa gereği).
const bgCanvases = new Map<string, HTMLCanvasElement>()

// Resim bitmap'leri: fileId → decode edilmiş canvas. Persist edilmez,
// IDB files deposundaki bytes'tan üretilir (PDF arkaplan deseni).
const imgBitmaps = new Map<string, HTMLCanvasElement>()

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
  // Yumuşatma durumu (SAYFA uzayı): startDrawing'de başa alınır.
  let smoothPt: { x: number; y: number } | null = null
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
    const w = Math.min(PAGE_MAX, Math.max(PAGE_MIN, Math.round(base.w) || A4.w))
    const h = Math.min(PAGE_MAX, Math.max(PAGE_MIN, Math.round(base.h) || A4.h))
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
    customW.value = Math.min(PAGE_MAX, Math.max(PAGE_MIN, Math.round(w)))
    customH.value = Math.min(PAGE_MAX, Math.max(PAGE_MIN, Math.round(h)))
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

  // Arayüz dili (l10n). Varsayılan Türkçe; <html lang> üzerinden beslenir.
  const locale = ref<Locale>(DEFAULT_LOCALE)
  const applyLocale = () => {
    if (typeof document === 'undefined' || !document.documentElement) return
    document.documentElement.lang = locale.value
  }
  const setLocale = (l: string) => {
    if (!isLocale(l)) return
    if (locale.value === l) return
    locale.value = l
    applyLocale()
    void persistSettings()
  }

  // Eski toolbar dizilimini yeni varsayılana göçürür: el silginin sağına.
  // v5 öncesi kayıtlarda el en sondadır; kullanıcının gizlilik/sıra tercihini
  // bozmadan sadece elin konumunu düzeltir.
  const migrateToolbarHand = (order: Tool[]): Tool[] => {
    const next: Tool[] = order.filter((t) => t !== 'hand')
    const ei = next.indexOf('eraser')
    const at = ei === -1 ? Math.min(2, next.length) : ei + 1
    next.splice(at, 0, 'hand')
    return next
  }

  const persistSettings = async (): Promise<void> => {
    try {
      const doc: AppSettings = {
        v: 5,
        paper: paper.value,
        background: { ...paperBackground.value },
        eraserMode: eraserMode.value,
        toolbar: { order: [...toolbarOrder.value], hidden: [...hiddenTools.value] },
        smoothing: smoothing.value,
        touchPan: touchPan.value,
        palettes: palettes.value.map((x) => ({ ...x, colors: [...x.colors], customs: [...x.customs] })),
        activePaletteId: activePaletteId.value,
        format: pageFormat.value,
        orientation: pageOrientation.value,
        customW: customW.value,
        customH: customH.value,
        uiTheme: uiTheme.value,
        locale: locale.value,
      }
      await storage.setKey(SETTINGS_KEY, doc)
    } catch {
      /* sessiz */
    }
  }

  // Ayar yedeği: indirilen JSON'u başka cihaza/tarayıcıya taşımak için.
  const exportSettingsJSON = (): string => {
    const doc: AppSettings = {
      v: 5,
      paper: paper.value,
      background: { ...paperBackground.value },
      eraserMode: eraserMode.value,
      toolbar: { order: [...toolbarOrder.value], hidden: [...hiddenTools.value] },
      smoothing: smoothing.value,
      touchPan: touchPan.value,
      palettes: palettes.value.map((x) => ({ ...x, colors: [...x.colors], customs: [...x.customs] })),
      activePaletteId: activePaletteId.value,
      format: pageFormat.value,
      orientation: pageOrientation.value,
      customW: customW.value,
      customH: customH.value,
      uiTheme: uiTheme.value,
      locale: locale.value,
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
    if (r.eraserMode === 'standard' || r.eraserMode === 'stroke') {
      eraserMode.value = r.eraserMode
      applied = true
    }
    if (typeof r.smoothing === 'number' && Number.isFinite(r.smoothing)) {
      smoothing.value = Math.min(0.9, Math.max(0, Math.round(r.smoothing * 100) / 100))
      applied = true
    }
    if (typeof r.touchPan === 'boolean') {
      touchPan.value = r.touchPan
      applied = true
    }
    if ('palettes' in r && r.palettes !== undefined) {
      const clean = cleanPalettes(r.palettes)
      if (clean.length > 0) {
        palettes.value = clean
        const aid = typeof r.activePaletteId === 'string' ? r.activePaletteId : ''
        activePaletteId.value = clean.some((x) => x.id === aid) ? aid : clean[0]!.id
        applied = true
      }
    }
    // Eski üst-seviye custom satırı aktif palete taşınır (veri kaybı yok).
    if (Array.isArray(r.customColors)) {
      const target =
        palettes.value.find((x) => x.id === activePaletteId.value) ?? palettes.value[0]
      if (target) {
        let moved = false
        for (const h of cleanCustomList(r.customColors)) {
          if (!target.customs.includes(h) && target.customs.length < CUSTOM_SLOT_COUNT) {
            target.customs.push(h)
            moved = true
          }
        }
        if (moved) applied = true
      }
    }
    if ('toolbar' in r && r.toolbar !== undefined) {
      const tb = cleanToolbar(r.toolbar)
      // v5 öncesi yedekte el en sondadır → silginin sağına göçür.
      const needsHandFix = typeof r.v !== 'number' || (r.v as number) < 5
      toolbarOrder.value = needsHandFix ? migrateToolbarHand(tb.order) : tb.order
      hiddenTools.value = tb.hidden
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
      customW.value = Math.min(PAGE_MAX, Math.max(PAGE_MIN, Math.round(r.customW as number)))
      customH.value = Math.min(PAGE_MAX, Math.max(PAGE_MIN, Math.round(r.customH as number)))
      applied = true
    }
    if (r.uiTheme === 'koyu' || r.uiTheme === 'acik') {
      uiTheme.value = r.uiTheme
      applied = true
    }
    if (isLocale(r.locale)) {
      locale.value = r.locale
      applied = true
    }
    if (!applied) return false
    applyUiTheme()
    applyLocale()
    await persistSettings()
    if (canvasRef.value) {
      repaintBase()
      clearOverlay()
    }
    return true
  }

  const loadSettings = async (): Promise<void> => {    try {
      const raw = await storage.getKey<AppSettings>(SETTINGS_KEY)
      // Kayıt yoksa bile temayı/dili uygula: data-theme + lang hep yazılır.
      if (!raw || (raw.v !== 1 && raw.v !== 2 && raw.v !== 3 && raw.v !== 4 && raw.v !== 5)) {
        applyUiTheme()
        applyLocale()
        return
      }
      if (typeof raw.paper === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.paper)) {
        paper.value = raw.paper
      }
      if ((raw.v === 2 || raw.v === 3 || raw.v === 4 || raw.v === 5) && raw.background !== undefined) {
        paperBackground.value = cleanPaperBackground(raw.background)
      }
      if ((raw.v === 3 || raw.v === 4 || raw.v === 5) && (raw.eraserMode === 'standard' || raw.eraserMode === 'stroke')) {
        eraserMode.value = raw.eraserMode
      }
      if (typeof raw.smoothing === 'number' && Number.isFinite(raw.smoothing)) {
        smoothing.value = Math.min(0.9, Math.max(0, Math.round(raw.smoothing * 100) / 100))
      }
      if (typeof raw.touchPan === 'boolean') {
        touchPan.value = raw.touchPan
      }
      if (raw.palettes !== undefined) {
        const clean = cleanPalettes(raw.palettes)
        if (clean.length > 0) {
          palettes.value = clean
          const aid = typeof raw.activePaletteId === 'string' ? raw.activePaletteId : ''
          activePaletteId.value = clean.some((x) => x.id === aid) ? aid : clean[0]!.id
        }
      }
      // Eski üst-seviye custom satırı aktif palete taşınır (veri kaybı yok).
      if (Array.isArray(raw.customColors)) {
        const target =
          palettes.value.find((x) => x.id === activePaletteId.value) ?? palettes.value[0]
        if (target) {
          for (const h of cleanCustomList(raw.customColors)) {
            if (!target.customs.includes(h) && target.customs.length < CUSTOM_SLOT_COUNT) {
              target.customs.push(h)
            }
          }
        }
      }
      if (raw.toolbar !== undefined) {
        const tb = cleanToolbar(raw.toolbar)
        // v5 öncesi kayıtta el en sondadır → silginin sağına göçür.
        toolbarOrder.value = raw.v < 5 ? migrateToolbarHand(tb.order) : tb.order
        hiddenTools.value = tb.hidden
      }
      if (raw.format === 'custom' || (typeof raw.format === 'string' && raw.format in PAGE_FORMATS)) {
        pageFormat.value = raw.format as PageFormat
      }
      if (raw.orientation === 'portrait' || raw.orientation === 'landscape') {
        pageOrientation.value = raw.orientation
      }
      if (Number.isFinite(raw.customW) && Number.isFinite(raw.customH)) {
        customW.value = Math.min(PAGE_MAX, Math.max(PAGE_MIN, Math.round(raw.customW)))
        customH.value = Math.min(PAGE_MAX, Math.max(PAGE_MIN, Math.round(raw.customH)))
      }
      if (raw.uiTheme === 'koyu' || raw.uiTheme === 'acik') {
        uiTheme.value = raw.uiTheme
      }
      if (isLocale(raw.locale)) {
        locale.value = raw.locale
      }
      applyUiTheme()
      applyLocale()
    } catch {
      /* varsayılanlar */
    }
  }
  const color = ref('#ffffff')
  const cleanHexColor = (v: unknown): string | null =>
    typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null
  const cleanCustomList = (input: unknown): string[] => {
    if (!Array.isArray(input)) return []
    const clean: string[] = []
    for (const c of input) {
      const hex = cleanHexColor(c)
      if (hex && !clean.includes(hex) && clean.length < CUSTOM_SLOT_COUNT) clean.push(hex)
    }
    return clean
  }
  const cleanPalettes = (input: unknown): ColorPalette[] => {    if (!Array.isArray(input)) return []
    const out: ColorPalette[] = []
    for (const p of input) {
      if (!p || typeof p !== 'object' || out.length >= PALETTE_MAX_COUNT) continue
      const r = p as Record<string, unknown>
      if (!Array.isArray(r.colors)) continue
      const colors: string[] = []
      for (const c of r.colors) {
        const hex = cleanHexColor(c)
        if (hex && !colors.includes(hex) && colors.length < PALETTE_MAX_COLORS) colors.push(hex)
      }
      if (colors.length === 0) continue
      out.push({
        id: typeof r.id === 'string' && r.id ? r.id : newStrokeId(),
        name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 24) : `Palet ${out.length + 1}`,
        colors,
        customs: cleanCustomList(r.customs),
      })
    }
    return out
  }
  // Araç başına kalınlık hafızası: kalem ince, silgi kocaman olabilir; araç değişince geri gelir.
  // select/şekil mürekkep değil ya da kalem-aralığı kullanır (kayıtlı dursun yeter).
  // Tablo + tohum: config/tools (WIDTH_MIN/WIDTH_MAX/DEFAULT_WIDTHS).
  const widths = ref<Record<Tool, number>>({ ...DEFAULT_WIDTHS })
  // Mevcut aracın kalınlığı — template ve çizim buradan okur (eski strokeWidth ile aynı isim).
  const strokeWidth = computed(() => widths.value[currentTool.value])
  const widthMin = computed(() => WIDTH_MIN[currentTool.value])
  const widthMax = computed(() => WIDTH_MAX[currentTool.value])
  const currentTool = ref<Tool>('pen')
  // Silgi modu: standard (boya-kapat) vs stroke (dokunduğu çizgiyi tümden sil, undo'lu).
  const eraserMode = ref<EraserMode>('standard')
  const setEraserMode = (m: string) => {
    if (m !== 'standard' && m !== 'stroke') return
    if (eraserMode.value === m) return
    eraserMode.value = m
    void persistSettings()
  }
  // Yeni çizgilerin stili (kalem + şekiller; vurgu/silgi sabit).
  const strokeDash = ref<DashStyle>('solid')
  const setStrokeDash = (d: string) => {
    if (d !== 'solid' && d !== 'dash' && d !== 'dot') return
    strokeDash.value = d
  }
  const strokeOpacity = ref(1)
  const setStrokeOpacity = (n: number) => {
    if (!Number.isFinite(n)) return
    strokeOpacity.value = Math.min(1, Math.max(0.1, Math.round(n * 20) / 20))
  }
  // 0 = basınç kapalı, 2 = çok hassas. UI slider'dan ayarlanır.
  const pressureSensitivity = ref(1)
  // Yumuşatma 0..0.9: giriş noktalarına tek-kutuplu lowpass (titreme yutar, 0=ham).
  // Silgide uygulanmaz (kesim dairesi tam konum ister).
  const smoothing = ref(0.25)
  const setSmoothing = (n: number) => {
    if (!Number.isFinite(n)) return
    smoothing.value = Math.min(0.9, Math.max(0, Math.round(n * 100) / 100))
    void persistSettings()
  }
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
  const blankPage = (): Page => {
    const layerId = newStrokeId()
    return { id: newPageId(), layers: [{ id: layerId, name: 'Katman 1', visible: true, strokes: [] }], activeLayerId: layerId, texts: [], images: [], size: defaultPageSize() }
  }
  // Tek katmanlı göç/sıfırlama yardımcısı (v4 kayıtlar, PDF sayfaları).
  const singleLayerPage = (id: string, strokes: Stroke[], size: { w: number; h: number }): Page => {
    const layerId = newStrokeId()
    return { id, layers: [{ id: layerId, name: 'Katman 1', visible: true, strokes }], activeLayerId: layerId, texts: [], images: [], size }
  }

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
  // Zoom kelepçesi: config/engine (ZOOM_MIN/ZOOM_MAX).
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
  // Aktif katman: id tutmazsa ilk katmana düşer (bozuk kayda karşı emniyet).
  const activeLayer = computed(
    () => activePage.value.layers.find((l) => l.id === activePage.value.activeLayerId) ?? activePage.value.layers[0]!,
  )

  // Template uyumluluğu: store.strokes = aktif katmanın çizgileri (salt-okunur görünüm).
  // Store içi yazımlar activeLayer.value.strokes üzerindendir.
  const strokes = computed(() => activeLayer.value.strokes)

  // Undo ile çıkanlar buraya; yeni çizgi VEYA sayfa değişimi öldürür.
  // ESKİ Stroke[] redo — snapshot modeline geçildi (aşağıda DocSnap).
  interface DocSnap {
    pages: Page[]
    activePageIndex: number
  }
  const undoStack = ref<DocSnap[]>([])
  const redoStack = ref<DocSnap[]>([])
  // Derinlik: config/engine (HISTORY_CAP).

  const snapshotDoc = (): DocSnap => ({
    pages: pages.value.map((p) => ({
      id: p.id,
      layers: p.layers.map(snapshotLayer),
      activeLayerId: p.activeLayerId,
      texts: p.texts.map(snapshotText),
      images: p.images.map(snapshotImage),
      size: { w: p.size.w, h: p.size.h },
      ...(p.pdfPageIndex !== undefined ? { pdfPageIndex: p.pdfPageIndex } : {}),
    })),
    activePageIndex: activePageIndex.value,
  })

  const restoreDoc = (s: DocSnap) => {
    // Snapshot'lar değişmez: geri yükleme de klonlar (canlı yazım geçmişi kirletmesin).
    pages.value = s.pages.map((p) => ({
      id: p.id,
      layers: p.layers.map((l) => ({
        id: l.id,
        name: l.name,
        visible: l.visible,
        strokes: l.strokes.map(snapshotStroke),
      })),
      activeLayerId: p.activeLayerId,
      texts: p.texts.map(snapshotText),
      images: p.images.map(snapshotImage),
      size: { w: p.size.w, h: p.size.h },
      ...(p.pdfPageIndex !== undefined ? { pdfPageIndex: p.pdfPageIndex } : {}),
    }))
    activePageIndex.value = Math.min(s.activePageIndex, Math.max(0, pages.value.length - 1))
  }

  // Yapısal op öncesi çağrılır: redo ölür, derinlik cap'lenir.
  const pushHistory = () => {
    undoStack.value.push(snapshotDoc())
    if (undoStack.value.length > HISTORY_CAP) undoStack.value.shift()
    redoStack.value = []
    lastPushKey = ''
    // İlk gerçek düzenleme "önceki oturum" banner'ını bayatlatır: autosave onu
    // birazdan ezecek, geri yükleme artık eski özeti getirmez.
    savedSession.value = null
    flushFileDeletes()
  }

  // Sürekli op'lar (yazı, boyut sürgüsü) için: aynı anahtar art arda tek kayıt olur.
  let lastPushKey = ''
  const pushHistoryKeyed = (key: string) => {
    if (lastPushKey === key) return
    lastPushKey = key
    undoStack.value.push(snapshotDoc())
    if (undoStack.value.length > HISTORY_CAP) undoStack.value.shift()
    redoStack.value = []
    savedSession.value = null
    flushFileDeletes()
  }

  // Sürekli op grubunu kapatır (örn. ok tuşu bırakılınca): sonraki op yeni undo kaydı olur.
  const endHistoryGroup = () => {
    lastPushKey = ''
  }

  const clearHistory = () => {
    undoStack.value = []
    redoStack.value = []
    lastPushKey = ''
    flushFileDeletes()
  }
  // Son başarılı autosave saati (HH:MM) — header göstergesi, nadiren yazılır.
  const lastSavedAt = ref('')
  // Bulunan kayıtlı oturum özeti — OTOMATİK YÜKLENMEZ, kullanıcı banner'dan seçer.
  const savedSession = ref<{ when: string; pages: number; strokes: number } | null>(null)

  // Silgi history'de durur (replay tutarlılığı için) ama "çizgi" sayılmaz — HUD/undo bunu kullanır.
  // Her zaman AKTİF sayfa sayılır.
  const drawingCount = computed(() => {
    let n = 0
    for (const s of activeLayer.value.strokes) if (s.tool !== 'eraser') n += 1
    return n
  })

  // Yıkıcı dosya op'ları öncesi soru: herhangi bir sayfada mürekkep/metin/resim var mı.
  const hasInk = computed(() =>
    pages.value.some(
      (p) =>
        p.texts.length > 0 ||
        p.images.length > 0 ||
        p.layers.some((l) => l.strokes.length > 0),
    ),
  )

  // Sayaçlar aktif sayfadan yeniden hesaplanır (nadir op'larda O(sayfa) — drift yok).
  const recountActive = () => {
    drawingPerf.totalPoints = activeLayer.value.strokes.reduce(
      (n, s) => n + (s.tool === 'eraser' ? 0 : s.points.length),
      0,
    )
  }

  // --- Seçim (Faz 2): id tabanlı, aktif sayfa kapsamlı ---
  // Seçim yapısal değil: seçmek redo'yu öldürmez, sayfa değişimi/undo/yeni mürekkep temizler.
  const selectMode = ref<SelectMode>('rect')
  const setSelectMode = (m: string) => {
    if (m !== 'rect' && m !== 'lasso') return
    selectMode.value = m
  }
  const selectedIds = ref<string[]>([])
  const selectionCount = computed(() => selectedIds.value.length)
  const isSelected = (id: string): boolean => selectedIds.value.includes(id)
  const clearSelection = () => {
    if (selectedIds.value.length === 0) return
    selectedIds.value = []
    activeTextId.value = null
    activeImageId.value = null
  }
  // Alan seçimi: sayfa-uzayı koordinatlarla çağrılır (getPos çıktısı).
  const selectRectArea = (a: { x: number; y: number }, b: { x: number; y: number }): number => {
    selectedIds.value = selByRect(activeLayer.value.strokes, a, b)
    return selectedIds.value.length
  }
  const selectLassoArea = (poly: { x: number; y: number }[]): number => {
    selectedIds.value = selByLasso(activeLayer.value.strokes, poly)
    return selectedIds.value.length
  }
  const selectAll = (): number => {
    selectedIds.value = activeLayer.value.strokes.map((s) => s.id)
    return selectedIds.value.length
  }
  // Seçiliyi sil: yapısal op — redo ölür, base baştan boyanır, autosave kuyruğa girer.
  const deleteSelected = (): number => {
    if (selectedIds.value.length === 0) return 0
    const set = new Set(selectedIds.value)
    const before = activeLayer.value.strokes.length
    pushHistory()
    activeLayer.value.strokes = activeLayer.value.strokes.filter((s) => !set.has(s.id))
    const removed = before - activeLayer.value.strokes.length
    selectedIds.value = []
    activeTextId.value = null
    activeImageId.value = null
    recountActive()
    repaintBase()
    clearOverlay()
    scheduleSave()
    return removed
  }
  // Seçiliyi ötele (sayfa-uzayı delta): şekli bozmamak için delta, seçim kutusu
  // sayfada kalacak şekilde kelepçelenir, tüm noktalara AYNI delta uygulanır.
  // Yapısal op: redo ölür, save kuyruğa girer. Seçim korunur (zincir taşıma için).
  const moveSelected = (dx: number, dy: number): boolean => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false
    if (selectedIds.value.length === 0) return false
    const set = new Set(selectedIds.value)
    const size = activePage.value.size
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    let count = 0
    for (const s of activeLayer.value.strokes) {
      if (!set.has(s.id)) continue
      for (const p of s.points) {
        if (p.x < x0) x0 = p.x
        if (p.y < y0) y0 = p.y
        if (p.x > x1) x1 = p.x
        if (p.y > y1) y1 = p.y
        count++
      }
    }
    if (count === 0) {
      selectedIds.value = []
      return false
    }
    dx = Math.min(size.w - x1, Math.max(-x0, dx))
    dy = Math.min(size.h - y1, Math.max(-y0, dy))
    if (!dx && !dy) return false
    for (const s of activeLayer.value.strokes) {
      if (!set.has(s.id)) continue
      for (const p of s.points) {
        p.x += dx
        p.y += dy
      }
    }
    // Seçim korunur (zincir taşıma için). History: sürüklemede component başta açar,
    // nudge'ta component önce iter — burada kayıt YOK (tur başına tek kayıt).
    recountActive()
    repaintBase()
    scheduleSave()
    return true
  }
  // Pano: sayfalar-arası çalışır, içerik idsiz saklanır (yapıştırma yeni id verir).
  // Reaktivite dışı; buton durumu için sayacı ayrıca senkronlanır.
  let clipboard: Omit<Stroke, 'id'>[] = []
  const clipboardCount = ref(0)
  const copySelected = (): number => {
    if (selectedIds.value.length === 0) return 0
    const set = new Set(selectedIds.value)
    clipboard = activeLayer.value.strokes
      .filter((s) => set.has(s.id))
      .map((s) => ({
        tool: s.tool,
        color: s.color,
        width: s.width,
        dash: s.dash,
        opacity: s.opacity,
        points: s.points.map((p) => ({ x: p.x, y: p.y, pressure: p.pressure })),
      }))
    clipboardCount.value = clipboard.length
    return clipboard.length
  }
  const cutSelected = (): number => {
    const n = copySelected()
    if (n === 0) return 0
    deleteSelected()
    return n
  }
  // Yapıştırma hafif ötelenir (üst üste binmesin), kutu sayfada kalır.
  // Yapışanlar seçili gelir (zincir taşıma/yapıştırma için). Redo ölür.
  const pasteClipboard = (dx = 12, dy = 12): number => {
    if (clipboard.length === 0) return 0
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0
    const size = activePage.value.size
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const s of clipboard) {
      for (const p of s.points) {
        if (p.x < x0) x0 = p.x
        if (p.y < y0) y0 = p.y
        if (p.x > x1) x1 = p.x
        if (p.y > y1) y1 = p.y
      }
    }
    if (!Number.isFinite(x0) || !Number.isFinite(y0)) return 0
    dx = Math.min(size.w - x1, Math.max(-x0, dx))
    dy = Math.min(size.h - y1, Math.max(-y0, dy))
    const pasted: Stroke[] = clipboard.map((s) => ({
      id: newStrokeId(),
      tool: s.tool,
      color: s.color,
      width: s.width,
      dash: s.dash,
      opacity: s.opacity,
      points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy, pressure: p.pressure })),
    }))
    if (pasted.length === 0) return 0
    pushHistory()
    for (const s of pasted) activeLayer.value.strokes.push(s)
    selectedIds.value = pasted.map((s) => s.id)
    recountActive()
    repaintBase()
    clearOverlay()
    scheduleSave()
    return pasted.length
  }

  // --- Metin kutuları (Faz 4): aktif sayfa kapsamlı, stroke seçiminden bağımsız ---
  // Düzenlenen kutu activeTextId'de durur; araç değişimi/sayfa geçişi/undo kapatır.
  // Metin op'ları undo stack'inde DEĞİL (v1 kısıtı) ama redo'yu öldürür.
  const textSize = ref(24)
  const setTextSize = (n: number) => {
    if (!Number.isFinite(n)) return
    textSize.value = Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, Math.round(n)))
  }
  const activeTextId = ref<string | null>(null)
  const activeText = (): TextItem | null => {
    if (!activeTextId.value) return null
    return activePage.value.texts.find((t) => t.id === activeTextId.value) ?? null
  }
  const clearActiveText = () => {
    activeTextId.value = null
  }
  // Metin kaba kutusu (ölçümsüz tahmin; vuruş-testi ve daire-değme için yeterli).
  const textBBoxOf = (t: TextItem): { x0: number; y0: number; x1: number; y1: number } => {
    const lines = t.text.split('\n')
    const w = Math.max(...lines.map((l) => l.length)) * t.size * 0.62 + 8
    const h = lines.length * t.size * 1.25 + 4
    return { x0: t.x - 4, y0: t.y - 4, x1: t.x + w, y1: t.y + h }
  }
  // Tıklanan noktadaki en üst metin (kaba kutu: ölçümsüz tahmin, editör gerçeği gösterir).
  const textAt = (x: number, y: number): TextItem | null => {
    const items = activePage.value.texts
    for (let i = items.length - 1; i >= 0; i--) {
      const t = items[i]!
      if (!t.text) continue
      const bb = textBBoxOf(t)
      if (x >= bb.x0 && x <= bb.x1 && y >= bb.y0 && y <= bb.y1) return t
    }
    return null
  }
  const createText = (x: number, y: number): string => {
    const size = activePage.value.size
    const item: TextItem = {
      id: newStrokeId(),
      x: Math.min(size.w - 8, Math.max(0, x)),
      y: Math.min(size.h - 8, Math.max(0, y)),
      text: '',
      color: color.value,
      size: textSize.value,
    }
    pushHistory()
    activePage.value.texts.push(item)
    activeTextId.value = item.id
    selectedIds.value = []
    activeImageId.value = null
    scheduleSave()
    return item.id
  }
  const updateText = (id: string, text: string): boolean => {
    const t = activePage.value.texts.find((x) => x.id === id)
    if (!t) return false
    pushHistoryKeyed('text-type')
    t.text = text.slice(0, 2000)
    recountActive()
    repaintBase()
    scheduleSave()
    return true
  }
  const updateTextStyle = (id: string, patch: { color?: string; size?: number }): boolean => {
    const t = activePage.value.texts.find((x) => x.id === id)
    if (!t) return false
    pushHistoryKeyed('text-style')
    if (patch.color !== undefined && /^#[0-9a-fA-F]{6}$/.test(patch.color)) t.color = patch.color
    if (patch.size !== undefined && Number.isFinite(patch.size)) {
      t.size = Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, Math.round(patch.size)))
    }
    recountActive()
    repaintBase()
    scheduleSave()
    return true
  }
  const moveText = (id: string, dx: number, dy: number): boolean => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false
    const t = activePage.value.texts.find((x) => x.id === id)
    if (!t) return false
    const size = activePage.value.size
    const nx = Math.min(size.w - 8, Math.max(0, t.x + dx))
    const ny = Math.min(size.h - 8, Math.max(0, t.y + dy))
    if (nx === t.x && ny === t.y) return false
    t.x = nx
    t.y = ny
    repaintBase()
    scheduleSave()
    return true
  }
  const deleteText = (id: string): boolean => {
    if (!activePage.value.texts.some((t) => t.id === id)) return false
    pushHistory()
    activePage.value.texts = activePage.value.texts.filter((t) => t.id !== id)
    if (activeTextId.value === id) activeTextId.value = null
    recountActive()
    repaintBase()
    clearOverlay()
    scheduleSave()
    return true
  }

  // --- Resimler (Faz 4b): taşı/boyutlandır/sil; ekleme import pipeline'da ---
  const activeImageId = ref<string | null>(null)
  const activeImage = (): ImageItem | null => {
    if (!activeImageId.value) return null
    return activePage.value.images.find((t) => t.id === activeImageId.value) ?? null
  }
  // Tıklanan noktadaki en üst resim.
  const imageAt = (x: number, y: number): ImageItem | null => {
    const items = activePage.value.images
    for (let i = items.length - 1; i >= 0; i--) {
      const img = items[i]!
      if (x >= img.x && x <= img.x + img.w && y >= img.y && y <= img.y + img.h) return img
    }
    return null
  }
  const moveImage = (id: string, dx: number, dy: number): boolean => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false
    const img = activePage.value.images.find((x) => x.id === id)
    if (!img) return false
    const size = activePage.value.size
    const nx = Math.min(size.w - 8, Math.max(-img.w + 8, img.x + dx))
    const ny = Math.min(size.h - 8, Math.max(-img.h + 8, img.y + dy))
    if (nx === img.x && ny === img.y) return false
    img.x = nx
    img.y = ny
    repaintBase()
    scheduleSave()
    return true
  }
  const resizeImage = (id: string, w: number, h: number): boolean => {
    if (!Number.isFinite(w) || !Number.isFinite(h)) return false
    const img = activePage.value.images.find((x) => x.id === id)
    if (!img) return false
    const nw = Math.min(3000, Math.max(16, Math.round(w)))
    const nh = Math.min(3000, Math.max(16, Math.round(h)))
    if (nw === img.w && nh === img.h) return false
    pushHistoryKeyed('img-size')
    img.w = nw
    img.h = nh
    repaintBase()
    scheduleSave()
    return true
  }
  const deleteImage = (id: string): boolean => {
    const img = activePage.value.images.find((x) => x.id === id)
    if (!img) return false
    pushHistory()
    activePage.value.images = activePage.value.images.filter((t) => t.id !== id)
    if (activeImageId.value === id) activeImageId.value = null
    // Bytes SİLİNMEZ: undo referansı geri getirebilir (tekil silinti yetimleri IDB'de kalır).
    recountActive()
    repaintBase()
    clearOverlay()
    scheduleSave()
    return true
  }

  // --- Resim import pipeline: dosya → decode → cap → IDB → sayfaya yerleştir ---
  // Bitmap cap'i: config/engine (IMAGE_MAX_DIM, oran korunur).
  const imgBusy = ref(false)

  const bytesToCanvas = async (bytes: ArrayBuffer): Promise<HTMLCanvasElement | null> => {
    try {
      const bmp = await createImageBitmap(new Blob([bytes]))
      try {
        const scale = Math.min(1, IMAGE_MAX_DIM / Math.max(bmp.width, bmp.height))
        const w = Math.max(1, Math.round(bmp.width * scale))
        const h = Math.max(1, Math.round(bmp.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return null
        ctx.drawImage(bmp, 0, 0, w, h)
        return canvas
      } finally {
        bmp.close()
      }
    } catch {
      return null
    }
  }

  // Tıklanan noktaya ortalanmış yerleştirir (taşma payı moveImage sınırlarında).
  const addImage = async (
    file: File,
    x: number,
    y: number,
  ): Promise<{ id: string } | { error: string }> => {
    if (imgBusy.value) return { error: 'işlem sürüyor' }
    const looksImg = file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name)
    if (!looksImg) return { error: 'resim dosyası seç' }
    imgBusy.value = true
    try {
      const buf = await file.arrayBuffer()
      const canvas = await bytesToCanvas(buf)
      if (!canvas) return { error: 'resim okunamadı' }
      const fileId = `img-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
      // px ≈ pt (1:1); sayfaya sığmazsa oranlı küçült.
      const size = activePage.value.size
      const maxW = Math.max(64, size.w - 16)
      let w = canvas.width
      let h = canvas.height
      if (w > maxW) {
        h = Math.max(16, Math.round((h * maxW) / w))
        w = maxW
      }
      const rec: ImageFileRecord = {
        id: fileId,
        name: file.name,
        size: file.size,
        addedAt: Date.now(),
        w,
        h,
        bytes: buf,
      }
      await storage.setImage(rec)
      imgBitmaps.set(fileId, canvas)
      pushHistory()
      const item: ImageItem = {
        id: newStrokeId(),
        x: Math.min(size.w - 8, Math.max(-w + 8, Math.round(x - w / 2))),
        y: Math.min(size.h - 8, Math.max(-h + 8, Math.round(y - h / 2))),
        w,
        h,
        fileId,
      }
      activePage.value.images.push(item)
      activeImageId.value = item.id
      selectedIds.value = []
      activeTextId.value = null
      recountActive()
      repaintBase()
      clearOverlay()
      scheduleSave()
      return { id: item.id }
    } catch (e) {
      console.error('[calem] resim import hatası:', e)
      return { error: `resim eklenemedi (${e instanceof Error ? e.message : 'bilinmiyor'})` }
    } finally {
      imgBusy.value = false
    }
  }

  // Açılışta resim bitmap'lerini bytes'tan yeniden üretir (sessiz: kayıp resim atlanır).
  const restoreImageBitmaps = async (): Promise<void> => {
    try {
      const ids = new Set<string>()
      for (const p of pages.value) {
        for (const img of p.images ?? []) ids.add(img.fileId)
      }
      for (const fid of ids) {
        if (imgBitmaps.has(fid)) continue
        const rec = await storage.getImage(fid)
        if (!rec) continue
        const canvas = await bytesToCanvas(rec.bytes)
        if (canvas) imgBitmaps.set(fid, canvas)
      }
    } catch {
      /* resimsiz devam */
    }
  }

  // Sayfa(lar) çöpe giderken yetim bytes bırakma (yükleme yolu hariç — orada referans yeni doc'ta).
  // SADECE geri alınamaz bağlamlarda (import/kapat) çağrılır; undo kapsamındakiler queueFileDeletes.
  const deleteImageFilesOf = (pages: Page[]) => {
    for (const p of pages) {
      for (const img of p.images ?? []) {
        imgBitmaps.delete(img.fileId)
        void storage.deleteFile(img.fileId).catch(() => {})
      }
    }
  }

  // Undo kapsamındaki resim bytes'ları hemen atılmaz: snapshot'lar hâlâ o dosyaya
  // referans verebilir. Referans kalmayınca (history'den düşünce) süpürülür —
  // böylece Temizle/sayfa-sil sonrası Undo resmi bozuk getirmez.
  const pendingFileDeletes = new Set<string>()

  const referencedImageFileIds = (): Set<string> => {
    const ids = new Set<string>()
    const add = (list: Page[]) => {
      for (const p of list) for (const img of p.images ?? []) ids.add(img.fileId)
    }
    add(pages.value)
    for (const s of undoStack.value) add(s.pages)
    for (const s of redoStack.value) add(s.pages)
    return ids
  }

  // Gerçek silme: canlı doküman ve hiçbir snapshot referans etmiyorsa bytes'ı at.
  const flushFileDeletes = () => {
    if (pendingFileDeletes.size === 0) return
    const live = referencedImageFileIds()
    for (const id of [...pendingFileDeletes]) {
      if (live.has(id)) continue
      pendingFileDeletes.delete(id)
      imgBitmaps.delete(id)
      void storage.deleteFile(id).catch(() => {})
    }
  }

  const queueFileDeletes = (fileIds: string[]) => {
    for (const id of fileIds) pendingFileDeletes.add(id)
    flushFileDeletes()
  }

  // --- Katman op'ları (aktif sayfa kapsamlı) ---
  // Ekle/sil/sırala yapısal: redo ölür. Görünürlük undo dışı ama kayda girer.
  const addLayer = (name?: string): string => {
    const p = activePage.value
    const clean = typeof name === 'string' ? name.trim().slice(0, 40) : ''
    pushHistory()
    const layer: Layer = {
      id: newStrokeId(),
      name: clean || `Katman ${p.layers.length + 1}`,
      visible: true,
      strokes: [],
    }
    p.layers.push(layer)
    p.activeLayerId = layer.id
    selectedIds.value = []
    activeTextId.value = null
    activeImageId.value = null
    recountActive()
    repaintBase()
    clearOverlay()
    scheduleSave()
    return layer.id
  }
  const deleteLayer = (id: string): boolean => {
    const p = activePage.value
    const i = p.layers.findIndex((l) => l.id === id)
    if (i === -1) return false
    pushHistory()
    if (p.layers.length <= 1) {
      // Son katman silinmez — içi boşaltılır (metin/resim durur).
      p.layers[0]!.strokes = []
    } else {
      p.layers.splice(i, 1)
      if (p.activeLayerId === id) {
        p.activeLayerId = p.layers[Math.min(i, p.layers.length - 1)]!.id
      }
    }
    selectedIds.value = []
    activeTextId.value = null
    activeImageId.value = null
    recountActive()
    repaintBase()
    clearOverlay()
    scheduleSave()
    return true
  }
  const renameLayer = (id: string, name: string): boolean => {
    const l = activePage.value.layers.find((x) => x.id === id)
    if (!l) return false
    const clean = typeof name === 'string' ? name.trim().slice(0, 40) : ''
    if (!clean || clean === l.name) return false
    pushHistory()
    l.name = clean
    scheduleSave()
    return true
  }
  const setActiveLayer = (id: string): boolean => {
    const p = activePage.value
    if (p.activeLayerId === id) return false
    if (!p.layers.some((l) => l.id === id)) return false
    p.activeLayerId = id
    selectedIds.value = []
    return true
  }
  const toggleLayerVisible = (id: string): boolean => {
    const l = activePage.value.layers.find((x) => x.id === id)
    if (!l) return false
    pushHistory()
    l.visible = !l.visible
    repaintBase()
    scheduleSave()
    return true
  }
  // dir +1: üste (sona), -1: alta (başa). Sınırda false.
  const moveLayer = (id: string, dir: 1 | -1): boolean => {
    const p = activePage.value
    const i = p.layers.findIndex((l) => l.id === id)
    const j = i + dir
    if (i === -1 || j < 0 || j >= p.layers.length) return false
    pushHistory()
    const tmp = p.layers[i]!
    p.layers[i] = p.layers[j]!
    p.layers[j] = tmp
    repaintBase()
    scheduleSave()
    return true
  }
  // --- Toolbar konfigürasyonu (Faz 9): sıra + gizli araçlar, v4 ayar ---
  const toolbarOrder = ref<Tool[]>([...ALL_TOOLS])
  const hiddenTools = ref<Tool[]>([])
  const cleanToolbar = (input: unknown): ToolbarConfig => {
    const fb: ToolbarConfig = { order: [...ALL_TOOLS], hidden: [] }
    if (!input || typeof input !== 'object') return fb
    const r = input as Record<string, unknown>
    const order: Tool[] = []
    if (Array.isArray(r.order)) {
      for (const t of r.order) {
        if (typeof t === 'string' && (ALL_TOOLS as string[]).includes(t) && !order.includes(t as Tool)) {
          order.push(t as Tool)
        }
      }
    }
    for (const t of ALL_TOOLS) if (!order.includes(t)) order.push(t)
    const hidden: Tool[] = []
    if (Array.isArray(r.hidden)) {
      for (const t of r.hidden) {
        if (typeof t === 'string' && (ALL_TOOLS as string[]).includes(t) && !hidden.includes(t as Tool)) {
          hidden.push(t as Tool)
        }
      }
    }
    return { order, hidden }
  }
  const setToolVisible = (t: Tool, visible: boolean) => {
    const i = hiddenTools.value.indexOf(t)
    if (visible && i !== -1) hiddenTools.value.splice(i, 1)
    if (!visible && i === -1 && hiddenTools.value.length < ALL_TOOLS.length - 1) {
      hiddenTools.value.push(t)
    }
    void persistSettings()
  }
  const moveTool = (t: Tool, dir: 1 | -1) => {
    const arr = toolbarOrder.value
    const i = arr.indexOf(t)
    const j = i + dir
    if (i === -1 || j < 0 || j >= arr.length) return
    arr[i] = arr[j]!
    arr[j] = t
    void persistSettings()
  }
  const resetToolbar = () => {
    toolbarOrder.value = [...ALL_TOOLS]
    hiddenTools.value = []
    void persistSettings()
  }
  // Araç değişimi seçimi ve metin editörünü temizler (gizli durumla mürekkep karışmasın).
  const setTool = (tool: Tool) => {
    if (currentTool.value !== tool) currentTool.value = tool
    // Aynı araç tekrar seçilirse de geçici durum temizlenir: aktif metin/resim
    // editörünü veya seçimi kapatmanın bir yolu olur (eskiden erken dönüyordu).
    selectedIds.value = []
    activeTextId.value = null
    activeImageId.value = null
  }

  // Color change
  const setColor = (col: string) => {
    color.value = col
  }

  // --- Renk paletleri: kayıtlı setler, switchlenebilir ---
  const palettes = ref<ColorPalette[]>(
    DEFAULT_PALETTES.map((p) => ({ ...p, colors: [...p.colors] })),
  )
  const activePaletteId = ref<string>(DEFAULT_PALETTES[0]!.id)
  const activePalette = computed(
    () => palettes.value.find((p) => p.id === activePaletteId.value) ?? palettes.value[0]!,
  )
  const setActivePalette = (id: string) => {
    if (activePaletteId.value === id) return
    if (!palettes.value.some((p) => p.id === id)) return
    activePaletteId.value = id
    void persistSettings()
  }
  const addPalette = (name?: string): string | null => {
    if (palettes.value.length >= PALETTE_MAX_COUNT) return null
    const clean = typeof name === 'string' ? name.trim().slice(0, 24) : ''
    // Tohum: custom satır doluysa hepsi birlikte kaydedilir, yoksa mevcut renk.
    const seed = customColors.value.length > 0 ? [...customColors.value] : [color.value]
    const p: ColorPalette = {
      id: newStrokeId(),
      name: clean || `Palet ${palettes.value.length + 1}`,
      colors: seed,
      customs: [],
    }
    palettes.value.push(p)
    activePaletteId.value = p.id
    void persistSettings()
    return p.id
  }
  const renamePalette = (id: string, name: string): boolean => {
    const p = palettes.value.find((x) => x.id === id)
    if (!p) return false
    const clean = typeof name === 'string' ? name.trim().slice(0, 24) : ''
    if (!clean || clean === p.name) return false
    p.name = clean
    void persistSettings()
    return true
  }
  const deletePalette = (id: string): boolean => {
    if (palettes.value.length <= 1) return false
    if (!palettes.value.some((p) => p.id === id)) return false
    palettes.value = palettes.value.filter((p) => p.id !== id)
    if (activePaletteId.value === id) activePaletteId.value = palettes.value[0]!.id
    void persistSettings()
    return true
  }
  // Mevcut rengi palete ekler (yoksa; varsa sadece seçer). Hedef verilmezse aktif palet.
  const addColorToPalette = (hex?: string, paletteId?: string): boolean => {
    const p = paletteId ? (palettes.value.find((x) => x.id === paletteId) ?? activePalette.value) : activePalette.value
    if (!p) return false
    const h = cleanHexColor(hex ?? color.value)
    if (!h) return false
    if (p.colors.includes(h)) {
      color.value = h
      return true
    }
    if (p.colors.length >= PALETTE_MAX_COLORS) return false
    p.colors.push(h)
    color.value = h
    void persistSettings()
    return true
  }
  // Custom satırdakileri palete toplu ekler (eksikler, cap dahilinde). Yeni palet tersi yöndür.
  const appendCustomsToPalette = (paletteId: string): number => {
    const p = palettes.value.find((x) => x.id === paletteId)
    if (!p || customColors.value.length === 0) return 0
    let added = 0
    for (const h of customColors.value) {
      if (p.colors.includes(h)) continue
      if (p.colors.length >= PALETTE_MAX_COLORS) break
      p.colors.push(h)
      added++
    }
    if (added === 0) return 0
    void persistSettings()
    return added
  }
  const removeColorFromPalette = (hex: string): boolean => {
    const p = activePalette.value
    if (!p || p.colors.length <= 1) return false
    if (!p.colors.includes(hex)) return false
    p.colors = p.colors.filter((c) => c !== hex)
    if (color.value === hex) color.value = p.colors[0]!
    void persistSettings()
    return true
  }

  // Custom satırı palet-başınadır: palet değişince customs da değişir.
  // Sabit 8 slot: dolular önden dizilir, boşlar "+" gösterir. Boş tık ekler,
  // doluya tek tık seçer, ✎ damlayla düzenler.
  const customColors = computed(() => activePalette.value?.customs ?? [])
  // Slotu mevcut renkle güncelle (sadece dolu slot).
  const setCustomSlot = (i: number, hex?: string): boolean => {
    const p = activePalette.value
    if (!p) return false
    const h = cleanHexColor(hex ?? color.value)
    if (!h) return false
    if (!Number.isInteger(i) || i < 0 || i >= p.customs.length) return false
    const next = [...p.customs]
    next[i] = h
    p.customs = next
    color.value = h
    void persistSettings()
    return true
  }
  const addCustomColor = (hex?: string): boolean => {
    const p = activePalette.value
    if (!p) return false
    const h = cleanHexColor(hex ?? color.value)
    if (!h) return false
    if (p.customs.includes(h)) {
      color.value = h
      return true
    }
    if (p.customs.length >= CUSTOM_SLOT_COUNT) return false
    p.customs.push(h)
    color.value = h
    void persistSettings()
    return true
  }
  const removeCustomColor = (hex: string): boolean => {
    const p = activePalette.value
    if (!p || !p.customs.includes(hex)) return false
    p.customs = p.customs.filter((c) => c !== hex)
    if (color.value === hex && p.customs.length > 0) color.value = p.customs[0]!
    void persistSettings()
    return true
  }

  // Stroke width change — ilgili araca yazılır, aralığına kelepçelenir.
  const setStrokeWidth = (w: number) => {
    const t = currentTool.value
    widths.value[t] = Math.min(WIDTH_MAX[t], Math.max(WIDTH_MIN[t], Math.round(w)))
  }

  const setRejectTouch = (v: boolean) => {
    rejectTouch.value = v
  }

  // Dokunmayla kaydır (opsiyonel): açıkken PARMAK her araçta kaydırır, kalem/fare çizer.
  // Avuç reddiyle iyi ikili olur (parmak=kaydır, kalem=çizer, avuç=yok).
  const touchPan = ref(false)
  const setTouchPan = (v: boolean) => {
    touchPan.value = v
    void persistSettings()
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

  const getDPR = () => Math.min(window.devicePixelRatio || 1, DPR_CAP)

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

  // Seçim etkileşimi için sayfa koordinatı (component marquee/lasso/taşıma buradan beslenir).
  const eventToPage = (e: PointerEvent): { x: number; y: number } => getPos(e)

  const readPressure = (e: PointerEvent): number => {
    // mouse her zaman 1; stylus/touch basıncı yoksa nötr 0.5 (çizgi kaybolmasın)
    if (e.pointerType === 'mouse') return 1
    if (e.pressure && e.pressure > 0) return e.pressure
    return 0.5
  }

  // --- Silgi (iki mod da veri-seviyesinde): sökülen history'de yaşar ---
  // Vuruş: dokunduğu çizgiyi/metin kutusunu tümden söker. Kes: dairede kalanı keser.
  // Silgi stroke'ları hedef değildir (mürekkep hortlamasın).
  let eraseSession = 0
  let lastPushedSession = -1
  // Oturumun ilk gerçek sökümünde tek kayıt açar (sürükleme tek undo olur).
  const noteEraseMutation = () => {
    if (lastPushedSession !== eraseSession) {
      lastPushedSession = eraseSession
      pushHistory()
    }
  }
  // Metinler mürekkebin ÜSTÜNDE boyanır → vuruşta önce metne bakılır.
  const eraseStrokeAt = (x: number, y: number): boolean => {
    const hitText = textAt(x, y)
    if (hitText) {
      const tarr = activePage.value.texts
      const idx = tarr.findIndex((t) => t.id === hitText.id)
      if (idx !== -1) {
        noteEraseMutation()
        const [gone] = tarr.splice(idx, 1)
        if (activeTextId.value === gone!.id) activeTextId.value = null
        return true
      }
    }
    const arr = activeLayer.value.strokes
    for (let i = arr.length - 1; i >= 0; i--) {
      const s = arr[i]!
      if (s.tool === 'eraser') continue
      const bb = strokeBBox(s)
      if (!bb) continue
      if (x < bb.x0 || x > bb.x1 || y < bb.y0 || y > bb.y1) continue
      noteEraseMutation()
      const [gone] = arr.splice(i, 1)
      if (selectedIds.value.includes(gone!.id)) {
        selectedIds.value = selectedIds.value.filter((id) => id !== gone!.id)
      }
      return true
    }
    return false
  }

  // --- Kes-silgi (standart silgi): arkaplanı BOYAMAZ, çizgi verisini keser ---
  // Silgi dairesine giren segmentler history'den çıkar (koşular yeni parça olur).
  // Arkaplan (kâğıt deseni / PDF / resim) tanımsız korunur — layer mekaniği gibi
  // ama render katmanı bölmeden, veri seviyesinde. Undo mezarla geri getirir.
  const eraseRadius = (): number => Math.max(strokeWidth.value / 2, 2.5)
  const splitEraseAt = (x: number, y: number, radius: number): boolean => {
    const layer = activeLayer.value
    let touched = false
    const touch = () => {
      if (!touched) {
        touched = true
        noteEraseMutation()
      }
    }
    // Metin kutuları parçalanmaz: daire değerse tümden gider.
    const tarr = activePage.value.texts
    for (let i = tarr.length - 1; i >= 0; i--) {
      const t = tarr[i]!
      if (!t.text) continue
      const bb = textBBoxOf(t)
      const nx = Math.min(Math.max(x, bb.x0), bb.x1)
      const ny = Math.min(Math.max(y, bb.y0), bb.y1)
      const dx = x - nx
      const dy = y - ny
      if (dx * dx + dy * dy > radius * radius) continue
      touch()
      const [gone] = tarr.splice(i, 1)
      if (activeTextId.value === gone!.id) activeTextId.value = null
    }
    const keptSel = new Set(selectedIds.value)
    let selChanged = false
    for (let i = layer.strokes.length - 1; i >= 0; i--) {
      const s = layer.strokes[i]!
      const bb = strokeBBox(s)
      if (!bb) continue
      if (bb.x1 < x - radius || bb.x0 > x + radius || bb.y1 < y - radius || bb.y0 > y + radius) continue
      const runs = splitRunsOutside(s.points, x, y, radius)
      if (runs.length === 1 && runs[0]!.length === s.points.length) continue // değmedi
      touch()
      layer.strokes.splice(i, 1)
      const pieces: Stroke[] = []
      for (const run of runs) {
        if (run.length === 0) continue
        const piece: Stroke = {
          id: newStrokeId(),
          tool: s.tool,
          color: s.color,
          width: s.width,
          dash: s.dash,
          opacity: s.opacity,
          points: run,
        }
        pieces.push(piece)
      }
      // Parçalar orijinal sıraya (z-düzeni korunur).
      layer.strokes.splice(i, 0, ...pieces)
      if (keptSel.delete(s.id)) {
        for (const p of pieces) keptSel.add(p.id)
        selChanged = true
      }
    }
    if (!touched) return false
    if (selChanged) selectedIds.value = [...keptSel]
    return true
  }

  // ✅ Başlat - basılı tutunca. rejectTouch'ta touch yok sayılır.
  // Sayfa DIŞINA basım yok sayılır (kenar dışı nokta tıklamasından mürekkep doğmaz).
  const startDrawing = (e: PointerEvent): boolean => {
    if (!canvasRef.value || isDrawing.value) return false
    if (currentTool.value === 'select' || currentTool.value === 'text' || currentTool.value === 'image' || currentTool.value === 'hand') return false
    if (shouldIgnoreEvent(e)) return false
    // Vuruş-silgi nokta toplamaz: dokunduğu anda söker.
    if (currentTool.value === 'eraser' && eraserMode.value === 'stroke') {
      isDrawing.value = true
      eraseSession += 1
      const { x, y } = getPos(e)
      if (eraseStrokeAt(x, y)) {
        recountActive()
        repaintBase()
        scheduleSave()
      }
      return true
    }
    // Kes-silgi nokta toplamaz, boyamaz: dairede kalan segmenti history'den keser.
    // Arkaplan (desen/PDF) hiçbir katmanda ezilmez.
    if (currentTool.value === 'eraser') {
      isDrawing.value = true
      eraseSession += 1
      const { x, y } = getPos(e)
      if (splitEraseAt(x, y, eraseRadius())) {
        recountActive()
        repaintBase()
        scheduleSave()
      }
      return true
    }
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
    smoothPt = { x: cx, y: cy }
    points.value = [{ x: cx, y: cy, pressure: p }]
    bb = { x0: cx, y0: cy, x1: cx, y1: cy }
    return true
  }

  // ✅ Çek - hareket ederken smooth çizim.
  // Desimasyon eşiği: config/engine (MIN_DIST_SCREEN).
  const draw = (e: PointerEvent) => {
    if (!isDrawing.value || !canvasRef.value) return
    if (shouldIgnoreEvent(e)) return

    // Vuruş-silgi: birikmiş olaylarda tek tek sök, tur başına tek boya.
    if (currentTool.value === 'eraser' && eraserMode.value === 'stroke') {
      let hit = false
      for (const ev of coalescedOf(e)) {
        const p = getPos(ev)
        if (eraseStrokeAt(p.x, p.y)) hit = true
      }
      if (hit) {
        recountActive()
        repaintBase()
        scheduleSave()
      }
      return
    }

    // Kes-silgi: dairede kalanı kes, tur başına tek boya (arkaplan ezilmez).
    if (currentTool.value === 'eraser') {
      const r = eraseRadius()
      let hit = false
      for (const ev of coalescedOf(e)) {
        const p = getPos(ev)
        if (splitEraseAt(p.x, p.y, r)) hit = true
      }
      if (hit) {
        recountActive()
        repaintBase()
        scheduleSave()
      }
      return
    }

    const raw = getPos(e)
    const size = activePage.value.size
    // Sayfa dışına taşan hareket kenara kelepçelenir (ekran/export tutarlılığı).
    let x = Math.min(size.w, Math.max(0, raw.x))
    let y = Math.min(size.h, Math.max(0, raw.y))
    // Yumuşatma: ham girdiyi lowpass'ten geçir (k=0 ham demektir).
    const k = smoothing.value
    if (k > 0 && smoothPt) {
      x = smoothPt.x + (x - smoothPt.x) * (1 - k)
      y = smoothPt.y + (y - smoothPt.y) * (1 - k)
    }
    smoothPt = { x, y }
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
  }

  // ✅ Bitti — stroke'u geçmişe kaydet ve base katmanına bir kez işle (overlay temizlenir).
  // Silgi nokta toplamaz: kes/vuruş oturumlarında points boştur, kayıt oluşmaz.
  const stopDrawing = () => {
    if (isDrawing.value && points.value.length > 0) {
      // Şekiller uç-noktayla saklanır (ara noktalar sürükleme artığıdır, export'u şişirmesin).
      const shapeEnds = isShapeTool(currentTool.value) ? shapeEndpoints(points.value) : null
      const stroke: Stroke = {
        id: newStrokeId(),
        tool: currentTool.value,
        color: color.value,
        width: strokeWidth.value,
        dash: strokeDash.value,
        opacity: strokeOpacity.value,
        points: shapeEnds
          ? [
              { x: shapeEnds[0].x, y: shapeEnds[0].y, pressure: shapeEnds[0].pressure },
              { x: shapeEnds[1].x, y: shapeEnds[1].y, pressure: shapeEnds[1].pressure },
            ]
          : [...points.value],
      }
      // Yeni mürekkep: ÖNCE pre-state kaydı, sonra ekle (undo çizeri geri alır).
      pushHistory()
      activeLayer.value.strokes.push(stroke)
      selectedIds.value = []
      activeTextId.value = null
    activeImageId.value = null
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
    opacity = 1,
  ) => {
    if (tool === 'eraser') {
      // LEGACY: eski kayıtlardaki boya-silgi replay'i. Yeni silgi keser, boyamaz —
      // bu dala yeni history düşmez (stopDrawing silgiye nokta kurmaz).
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
      ctx.globalAlpha = 0.95 * opacity
    }
  }

  // Kesikli desen (kalem + şekiller; vurgu/silgi düz). Genişliğe oranlı tireler.
  const dashFor = (tool: Tool, dash: DashStyle, w: number): number[] => {
    if (dash === 'solid') return []
    if (tool === 'highlighter' || tool === 'eraser' || tool === 'select' || tool === 'text' || tool === 'image' || tool === 'hand') return []
    if (dash === 'dash') return [Math.max(5, w * 3), Math.max(3, w * 1.8)]
    return [0.5, Math.max(2.5, w * 1.5)]
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

  // Şekil uç noktaları: ilk + son nokta (ara noktalar serbest çizim artığıdır).
  const shapeEndpoints = (pts: Point[]): [Point, Point] | null => {
    if (pts.length === 0) return null
    return [pts[0]!, pts[pts.length - 1]!]
  }

  // Primitif path kurar (stroke çağrılmaz — stiller üstte hazırdır).
  const paintShape = (ctx: CanvasRenderingContext2D, tool: ShapeTool, a: Point, b: Point) => {
    if (tool === 'line' || tool === 'arrow') {
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      if (tool === 'arrow') {
        const ang = Math.atan2(b.y - a.y, b.x - a.x)
        const len = Math.max(8, ctx.lineWidth * 4)
        const spread = Math.PI / 7
        for (const d of [-1, 1] as const) {
          ctx.moveTo(b.x, b.y)
          ctx.lineTo(b.x - len * Math.cos(ang + d * spread), b.y - len * Math.sin(ang + d * spread))
        }
      }
      return
    }
    if (tool === 'rect') {
      ctx.beginPath()
      ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
      return
    }
    // ellipse: köşegenin tanımladığı kutuya iç teğet elips.
    ctx.beginPath()
    ctx.ellipse(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      Math.abs(b.x - a.x) / 2,
      Math.abs(b.y - a.y) / 2,
      0,
      0,
      Math.PI * 2,
    )
  }

  const paintStroke = (
    ctx: CanvasRenderingContext2D,
    s: Pick<Stroke, 'tool' | 'color' | 'width' | 'dash' | 'opacity' | 'points'>,
    paperHex: string | null,
  ) => {
    if (s.points.length === 0) return
    ctx.save()
    const w = s.tool === 'eraser' ? s.width : effectiveWidth(s.points, s.width)
    applyStyleForStroke(ctx, s.tool, s.color, w, paperHex, s.opacity)
    ctx.setLineDash(dashFor(s.tool, s.dash, w))
    // Dejenere şekil (tek nokta / sıfır boy) nokta olarak düşer.
    let dotted = false
    if (isShapeTool(s.tool)) {
      const ends = shapeEndpoints(s.points)
      if (ends && (ends[0].x !== ends[1].x || ends[0].y !== ends[1].y)) {
        paintShape(ctx, s.tool, ends[0], ends[1])
        ctx.stroke()
      } else {
        dotted = true
      }
    } else {
      strokePath(ctx, s.points)
      ctx.stroke()
      // Tek nokta ise dolgu da yap ki görünsün
      dotted = s.points.length === 1
    }
    if (dotted) {
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
  // Pay: config/engine (DIRTY_PAD_SCREEN).
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

  // Metin kutuları: mürekkebin ÜSTÜNDE (silgi metni yemez — v1 kısıtı, Xournal katman sırası gibi).
  // Çok satır desteklenir; kaydırma yok, taşma kesilmez (sayfa-içi kalması kullananın işi).
  const paintTexts = (ctx: CanvasRenderingContext2D, page: Page) => {
    const items = page.texts
    if (!items || items.length === 0) return
    ctx.save()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    for (const t of items) {
      if (!t.text) continue
      ctx.fillStyle = t.color
      ctx.font = `${t.size}px sans-serif`
      const lh = t.size * 1.25
      const lines = t.text.split('\n')
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i]!, t.x, t.y + i * lh)
      }
    }
    ctx.restore()
  }

  // Resimler: arkaplanın üstü, mürekkebin altı. Bitmap yoksa (yüklenemediyse) atlanır.
  const paintImages = (ctx: CanvasRenderingContext2D, page: Page) => {
    const items = page.images
    if (!items || items.length === 0) return
    for (const img of items) {
      const bmp = imgBitmaps.get(img.fileId)
      if (!bmp) continue
      ctx.drawImage(bmp, img.x, img.y, img.w, img.h)
    }
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
    paintImages(ctx, page)
    // Katmanlar sırayla (0 en alt); görünmez katman atlanır.
    for (const layer of page.layers) {
      if (!layer.visible) continue
      for (const s of layer.strokes) {
        paintStroke(ctx, s, paperHex)
      }
    }
    paintTexts(ctx, page)
  }

  // Export sayfa boyutu = sayfanın kendi boyutu (bg'li: orijinal punto, boş: A4).
  // Ekran px'ini punto saymak 19 inçlik sayfalar üretirdi — jsPDF'e yön de şart
  // (belirtilmezse landscape içeriğe portrait MediaBox açıyor).
  const exportPageSize = (page: Page) => ({ w: page.size.w, h: page.size.h })

  // Export raster (varsayılan ölçek: config/engine EXPORT_SCALE).
  // Remap YOK — mürekkep zaten sayfa uzayında, arkaplan tam kanama.
  const exportPageToCanvas = (page: Page, scale = EXPORT_SCALE): HTMLCanvasElement | null => {
    const { w, h } = page.size
    if (!(w > 0 && h > 0)) return null
    if (!Number.isFinite(scale) || scale <= 0) return null
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w * scale))
    canvas.height = Math.max(1, Math.round(h * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
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
    if (currentTool.value === 'eraser' || currentTool.value === 'select' || currentTool.value === 'text' || currentTool.value === 'image' || currentTool.value === 'hand') return
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
            dash: strokeDash.value,
            opacity: strokeOpacity.value,
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
    const goneImageIds = activePage.value.images.map((i) => i.fileId)
    pushHistory()
    activeLayer.value.strokes = []
    activePage.value.texts = []
    activePage.value.images = []
    queueFileDeletes(goneImageIds)
    selectedIds.value = []
    activeTextId.value = null
    activeImageId.value = null
    points.value = []
    recountActive()
    isDrawing.value = false
    cachedRect = null
    bb = null
    // Sadece mürekkep gider: repaint kâğıt/deseni ve PDF arkaplanını geri koyar.
    repaintBase()
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

  // PDF kalite politikası: config/engine (PDF_RENDER_*, RERENDER_DELAY).
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
      const scale = pdf.numPages > PDF_MANY_THRESHOLD ? PDF_RENDER_MANY : PDF_RENDER_BASE
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
      await storage.setFile({
        id,
        name: file.name,
        size: file.size,
        addedAt: Date.now(),
        pageCount: rendered.length,
        bytes: stored,
      })
      if (pdfId.value && pdfId.value !== id) {
        void storage.deleteFile(pdfId.value).catch(() => {})
      }
      bgCanvases.clear()
      pdfRenderScales.clear()
      pdfBytesCache = new Uint8Array(stored)
      deleteImageFilesOf(pages.value)
      // Sayfa boyutu = PDF puntosu (bitmap aspect ile aynı, inşa gereği).
      pages.value = rendered.map((r) => singleLayerPage(newPageId(), [], { w: r.cssW, h: r.cssH }))
      rendered.forEach((r, i) => {
        const p = pages.value[i]!
        bgCanvases.set(p.id, r.canvas)
        pdfRenderScales.set(p.id, scale)
        p.pdfPageIndex = i
      })
      pdfId.value = id
      pdfName.value = file.name
      activePageIndex.value = 0
      clearHistory()
      selectedIds.value = []
      activeTextId.value = null
    activeImageId.value = null
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

  // --- Vektör PDF export (Faz 8): mürekkep path olarak gömülür ---
  // Hibrit: şeffaf-zemin + standart-silgi sayfası raster'a düşer (destination-out'un
  // vektör karşılığı yok). Diğer her şey vektör: küçük dosya, keskin baskı.
  type PdfDoc = InstanceType<typeof import('jspdf').jsPDF>

  const hexToRgb = (hex: string): [number, number, number] => {
    const h = hex.replace('#', '')
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
    const n = parseInt(full, 16)
    if (Number.isNaN(n)) return [255, 255, 0]
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }

  const paintStrokeVector = (doc: PdfDoc, GState: new (p: { opacity?: number }) => unknown, s: Stroke, paperHex: string | null) => {
    if (s.points.length === 0) return
    const w = s.tool === 'eraser' ? s.width : effectiveWidth(s.points, s.width)
    doc.saveGraphicsState()
    try {
      if (s.tool === 'eraser') {
        // Opak mod garantili (çağrı yeri şeffaf sayfayı raster'a yollar).
        const [r, g, b] = hexToRgb(paperHex ?? '#ffffff')
        doc.setDrawColor(r, g, b)
        doc.setFillColor(r, g, b)
        doc.setLineWidth(Math.max(w, 5))
      } else if (s.tool === 'highlighter') {
        const [r, g, b] = hexToRgb(s.color)
        doc.setDrawColor(r, g, b)
        doc.setFillColor(r, g, b)
        doc.setLineWidth(Math.max(w * 2.5, 8))
        doc.setGState(new GState({ opacity: 0.5 }) as never)
      } else {
        const [r, g, b] = hexToRgb(s.color)
        doc.setDrawColor(r, g, b)
        doc.setFillColor(r, g, b)
        doc.setLineWidth(Math.max(w, 1))
        if (s.opacity < 1) doc.setGState(new GState({ opacity: s.opacity }) as never)
      }
      doc.setLineCap('round')
      doc.setLineJoin('round')
      const dash = dashFor(s.tool, s.dash, w)
      if (dash.length > 0) doc.setLineDashPattern(dash, 0)
      if (isShapeTool(s.tool)) {
        const ends = shapeEndpoints(s.points)
        if (!ends || (ends[0].x === ends[1].x && ends[0].y === ends[1].y)) {
          const p = s.points[0]!
          doc.circle(p.x, p.y, Math.max(w / 2, 1), 'F')
          return
        }
        const [a, b] = ends
        if (s.tool === 'line' || s.tool === 'arrow') {
          doc.moveTo(a.x, a.y)
          doc.lineTo(b.x, b.y)
          if (s.tool === 'arrow') {
            const ang = Math.atan2(b.y - a.y, b.x - a.x)
            const len = Math.max(8, doc.getLineWidth() * 4)
            const spread = Math.PI / 7
            for (const d of [-1, 1]) {
              doc.moveTo(b.x, b.y)
              doc.lineTo(b.x - len * Math.cos(ang + d * spread), b.y - len * Math.sin(ang + d * spread))
            }
          }
          doc.stroke()
          return
        }
        if (s.tool === 'rect') {
          doc.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
          return
        }
        doc.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2)
        return
      }
      if (s.points.length === 1) {
        const p = s.points[0]!
        doc.circle(p.x, p.y, Math.max(w / 2, 1), 'F')
        return
      }
      const p0 = s.points[0]!
      doc.moveTo(p0.x, p0.y)
      for (const p of s.points.slice(1)) doc.lineTo(p.x, p.y)
      doc.stroke()
    } finally {
      doc.restoreGraphicsState()
    }
  }

  const paintStrokesVector = (doc: PdfDoc, GState: new (p: { opacity?: number }) => unknown, page: Page, paperHex: string | null) => {
    for (const layer of page.layers) {
      if (!layer.visible) continue
      for (const s of layer.strokes) paintStrokeVector(doc, GState, s, paperHex)
    }
  }

  // Şeffaf zeminde standart-silgi varsa vektör sadakati bozulur → raster fallback.
  // (Vuruş-silgi history'den söker, iz bırakmaz — her zaman vektör-güvenli.)
  const pageNeedsRaster = (page: Page): boolean => {
    if (paperFor(page) !== null) return false
    for (const layer of page.layers) {
      if (!layer.visible) continue
      for (const s of layer.strokes) {
        if (s.tool === 'eraser') return true
      }
    }
    return false
  }

  // Kâğıt deseni vektör karşılığı (canvas paintPaperPattern ile aynı geometri).
  const paintPatternVector = (doc: PdfDoc, page: Page, bg: PaperBackground) => {
    if (bg.type === 'blank' && !bg.margin) return
    if (bgCanvases.has(page.id)) return
    const { w, h } = page.size
    const [r, g, b] = hexToRgb(bg.lineColor)
    doc.saveGraphicsState()
    try {
      doc.setDrawColor(r, g, b)
      doc.setFillColor(r, g, b)
      if (bg.type === 'ruled') {
        ruledLineYs(h, bg.spacing).forEach((y, i) => {
          doc.setLineWidth(i % 5 === 4 ? 1.2 : 0.7)
          doc.line(0, y, w, y)
        })
      } else if (bg.type === 'graph') {
        ruledLineYs(h, bg.spacing).forEach((y, i) => {
          doc.setLineWidth(i % 5 === 4 ? 1 : 0.5)
          doc.line(0, y, w, y)
        })
        graphLineXs(w, bg.spacing).forEach((x, i) => {
          doc.setLineWidth(i % 5 === 4 ? 1 : 0.5)
          doc.line(x, 0, x, h)
        })
      } else if (bg.type === 'dotted') {
        for (const p of dottedPoints(w, h, bg.spacing)) doc.circle(p.x, p.y, 1.3, 'F')
      } else if (bg.type === 'staff') {
        doc.setLineWidth(0.9)
        for (const group of staffLineYs(h, bg.spacing)) {
          for (const y of group) doc.line(0, y, w, y)
        }
      }
      if (bg.margin) {
        const mx = marginLineX(w)
        if (mx !== null) {
          const [mr, mg, mb] = hexToRgb(bg.marginColor)
          doc.setDrawColor(mr, mg, mb)
          doc.setLineWidth(1.2)
          doc.line(mx, 0, mx, h)
        }
      }
    } finally {
      doc.restoreGraphicsState()
    }
  }

  // Metinler vektör metin olarak (seçilebilir, keskin). Canvas ile aynı font metriği değil
  // (helvetica vs sans-serif) — satır kayması ±1pt toleranslıdır.
  const paintTextsVector = (doc: PdfDoc, page: Page) => {
    if (!page.texts || page.texts.length === 0) return
    for (const t of page.texts) {
      if (!t.text) continue
      const [r, g, b] = hexToRgb(t.color)
      doc.setTextColor(r, g, b)
      doc.setFontSize(t.size)
      doc.text(t.text.split('\n'), t.x, t.y, { baseline: 'top', lineHeightFactor: 1.25 })
    }
  }

  // PDF export: vektör-öncelikli hibrit. Sayfa başına karar verilir.
  // Üretim ve kaydetme ayrı (test edilebilirlik + hata ayrımı).
  const buildPdfDocument = async (): Promise<
    { doc: InstanceType<typeof import('jspdf').jsPDF>; pages: number } | { error: string }
  > => {
    // Not: busy kilidi çağrıda (exportPdf); burada tekrar kontrol YOK
    // (yoksa export kendini kilitler — gerçek vaka).
    if (pages.value.length === 0) return { error: 'sayfa yok' }
    const { jsPDF } = await import('jspdf')
    const GState = (jsPDF as unknown as { GState: new (p: { opacity?: number }) => unknown }).GState
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
      if (pageNeedsRaster(page)) {
        const rendered = exportPageToCanvas(page)
        if (!rendered) return { error: `sayfa ${i + 1} çizilemedi` }
        doc.addImage(rendered.toDataURL('image/png'), 'PNG', 0, 0, w, h)
        continue
      }
      const paperHex = paperFor(page)
      if (paperHex) {
        const [r, g, b] = hexToRgb(paperHex)
        doc.setFillColor(r, g, b)
        doc.rect(0, 0, w, h, 'F')
        paintPatternVector(doc, page, paperBackground.value)
      }
      const bg = bgCanvases.get(page.id)
      if (bg) doc.addImage(bg.toDataURL('image/jpeg', JPEG_QUALITY), 'JPEG', 0, 0, w, h)
      for (const img of page.images) {
        const bmp = imgBitmaps.get(img.fileId)
        if (bmp) doc.addImage(bmp.toDataURL('image/png'), 'PNG', img.x, img.y, img.w, img.h)
      }
      paintStrokesVector(doc, GState, page, paperHex)
      paintTextsVector(doc, page)
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
      const fileName = pdfFileName()
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

  // --- .calem aktarım dosyası: IDB'nin taşınabilir hali ---
  const bufToB64 = (buf: ArrayBuffer): string => {
    const bytes = new Uint8Array(buf)
    let s = ''
    for (let i = 0; i < bytes.length; i += B64_CHUNK) {
      s += String.fromCharCode(...bytes.subarray(i, i + B64_CHUNK))
    }
    return btoa(s)
  }

  const b64ToBuf = (b64: string): ArrayBuffer => {
    const s = atob(b64)
    const out = new Uint8Array(s.length)
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
    return out.buffer
  }

  const buildCalemJSON = async (): Promise<{ json: string } | { error: string }> => {
    try {
      const files: CalemFile['files'] = {}
      const imgIds = new Set<string>()
      for (const p of pages.value) {
        for (const img of p.images ?? []) imgIds.add(img.fileId)
      }
      for (const fid of imgIds) {
        const rec = await storage.getImage(fid)
        if (rec) files[fid] = { kind: 'image', name: rec.name, w: rec.w, h: rec.h, b64: bufToB64(rec.bytes) }
      }
      if (pdfId.value) {
        const prec = await storage.getFile(pdfId.value)
        if (prec) {
          files[prec.id] = { kind: 'pdf', name: prec.name, pageCount: prec.pageCount, b64: bufToB64(prec.bytes) }
        }
      }
      const settings: AppSettings = {
        v: 5,
        paper: paper.value,
        background: { ...paperBackground.value },
        eraserMode: eraserMode.value,
        toolbar: { order: [...toolbarOrder.value], hidden: [...hiddenTools.value] },
        smoothing: smoothing.value,
        touchPan: touchPan.value,
        palettes: palettes.value.map((x) => ({ ...x, colors: [...x.colors], customs: [...x.customs] })),
        activePaletteId: activePaletteId.value,
        format: pageFormat.value,
        orientation: pageOrientation.value,
        customW: customW.value,
        customH: customH.value,
        uiTheme: uiTheme.value,
        locale: locale.value,
      }
      const out: CalemFile = {
        app: 'calem',
        v: 1,
        savedAt: Date.now(),
        settings,
        doc: {
          pages: pages.value.map((p) => ({
            id: p.id,
            layers: p.layers.map(snapshotLayer),
            activeLayerId: p.activeLayerId,
            texts: p.texts.map(snapshotText),
            images: p.images.map(snapshotImage),
            size: { w: p.size.w, h: p.size.h },
            ...(p.pdfPageIndex !== undefined ? { pdfPageIndex: p.pdfPageIndex } : {}),
          })),
          widths: { ...widths.value },
          activePageIndex: activePageIndex.value,
          ...(pdfId.value ? { pdfId: pdfId.value, pdfName: pdfName.value } : {}),
        },
        files,
      }
      return { json: JSON.stringify(out) }
    } catch (e) {
      console.error('[calem] calem build hatası:', e)
      return { error: `dosya kurulamadı (${e instanceof Error ? e.message : 'bilinmiyor'})` }
    }
  }

  const saveCalemBlob = async (blob: Blob, fileName: string): Promise<'saved' | 'fallback' | 'cancelled'> => {
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
        types: [{ description: 'Calem belgesi', accept: { 'application/json': ['.calem'] } }],
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

  const exportCalem = async (
    opts: { prompt?: boolean } = {},
  ): Promise<{ pages: number } | { error: string } | { cancelled: true }> => {
    if (pdfBusy.value || imgBusy.value) return { error: 'işlem sürüyor' }
    pdfBusy.value = true
    try {
      const built = await buildCalemJSON()
      if ('error' in built) return built
      const fileName = calemFileName()
      if (opts.prompt !== false) {
        const how = await saveCalemBlob(new Blob([built.json], { type: 'application/json' }), fileName)
        if (how === 'saved') return { pages: pages.value.length }
        if (how === 'cancelled') return { cancelled: true }
      }
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([built.json], { type: 'application/json' }))
      a.download = fileName
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(a.href), 5000)
      return { pages: pages.value.length }
    } catch (e) {
      console.error('[calem] calem export hatası:', e)
      return { error: `yazılamadı (${e instanceof Error ? e.message : 'bilinmiyor'})` }
    } finally {
      pdfBusy.value = false
    }
  }

  // .calem açar: sayfaları + ayarları + bytes'ları değiştirir (component önceden confirm sorar).
  const importCalem = async (file: File): Promise<{ pages: number } | { error: string }> => {
    if (pdfBusy.value || imgBusy.value) return { error: 'işlem sürüyor' }
    let raw: unknown
    try {
      raw = JSON.parse(await file.text())
    } catch {
      return { error: 'calem dosyası değil' }
    }
    if (!raw || typeof raw !== 'object') return { error: 'calem dosyası değil' }
    const r = raw as Record<string, unknown>
    if (r.app !== 'calem' || r.v !== 1) return { error: 'desteklenmeyen calem sürümü' }
    const d = r.doc as { pages?: unknown; widths?: unknown; activePageIndex?: unknown; pdfId?: unknown; pdfName?: unknown } | undefined
    if (!d || !Array.isArray(d.pages)) return { error: 'sayfa yok' }
    pdfBusy.value = true
    try {
      const fallback = {
        w: canvasRef.value?.clientWidth || FALLBACK_VIEWPORT.w,
        h: canvasRef.value?.clientHeight || FALLBACK_VIEWPORT.h,
      }
      const clean = (d.pages as unknown as RawPage[])
        .map((p) => pageFromRaw(p, fallback))
        .filter((p): p is Page => p !== null)
      if (clean.length === 0) return { error: 'sayfa yok' }
      // Ayarlar (varsa): mevcut doğrulama hattı + tek persist + boya.
      if (r.settings && typeof r.settings === 'object') {
        await importSettingsJSON(JSON.stringify(r.settings))
      }
      // Bytes'lar ÖNCE: başarısızsa mevcut sahne korunur.
      const written = new Set<string>()
      const files = (r.files ?? {}) as Record<string, { kind?: unknown; name?: unknown; w?: unknown; h?: unknown; pageCount?: unknown; b64?: unknown }>
      for (const [fid, f] of Object.entries(files)) {
        if (!f || typeof f !== 'object' || typeof f.b64 !== 'string') continue
        let buf: ArrayBuffer
        try {
          buf = b64ToBuf(f.b64)
        } catch {
          continue
        }
        if (buf.byteLength === 0) continue
        if (f.kind === 'pdf') {
          await storage.setFile({
            id: fid,
            name: typeof f.name === 'string' ? f.name : 'belge.pdf',
            size: buf.byteLength,
            addedAt: Date.now(),
            pageCount: typeof f.pageCount === 'number' ? f.pageCount : 0,
            bytes: buf,
          })
          written.add(fid)
        } else if (f.kind === 'image') {
          await storage.setImage({
            id: fid,
            name: typeof f.name === 'string' ? f.name : 'resim',
            size: buf.byteLength,
            addedAt: Date.now(),
            w: typeof f.w === 'number' ? f.w : 0,
            h: typeof f.h === 'number' ? f.h : 0,
            bytes: buf,
          })
          written.add(fid)
        }
      }
      const w = d.widths as Record<string, unknown> | undefined
      if (w) {
        for (const t of ['pen', 'highlighter', 'eraser', 'line', 'rect', 'ellipse', 'arrow', 'text', 'image', 'hand'] as const) {
          const v = w[t]
          if (typeof v === 'number' && Number.isFinite(v)) {
            widths.value[t] = Math.min(WIDTH_MAX[t], Math.max(WIDTH_MIN[t], Math.round(v)))
          }
        }
      }
      // Eski sahnenin yetim bytes'larını temizle, sonra değiştir.
      deleteImageFilesOf(pages.value)
      if (pdfId.value) void storage.deleteFile(pdfId.value).catch(() => {})
      bgCanvases.clear()
      pdfRenderScales.clear()
      imgBitmaps.clear()
      pdfBytesCache = null
      pages.value = clean
      const idx = d.activePageIndex
      activePageIndex.value =
        typeof idx === 'number' && Number.isFinite(idx)
          ? Math.min(clean.length - 1, Math.max(0, Math.floor(idx)))
          : 0
      clearHistory()
      selectedIds.value = []
      activeTextId.value = null
      activeImageId.value = null
      points.value = []
      isDrawing.value = false
      bb = null
      const pid = typeof d.pdfId === 'string' ? d.pdfId : null
      if (pid && written.has(pid)) {
        pdfId.value = pid
        pdfName.value = typeof d.pdfName === 'string' ? d.pdfName : ''
        await restorePdfBackgrounds(pid)
      } else {
        pdfId.value = null
        pdfName.value = ''
      }
      await restoreImageBitmaps()
      layoutView()
      recountActive()
      repaintBase()
      clearOverlay()
      scheduleSave()
      return { pages: clean.length }
    } catch (e) {
      console.error('[calem] calem import hatası:', e)
      return { error: `açılamadı (${e instanceof Error ? e.message : 'bilinmiyor'})` }
    } finally {
      pdfBusy.value = false
    }
  }
  // PDF'i kapat: arkaplanlar gider, tek boş sayfaya dönülür, dosya kaydı silinir.
  const closePdf = () => {
    if (pdfId.value) void storage.deleteFile(pdfId.value).catch(() => {})
    bgCanvases.clear()
    pdfRenderScales.clear()
    pdfBytesCache = null
    pdfId.value = null
    pdfName.value = ''
    deleteImageFilesOf(pages.value)
    pages.value = [blankPage()]
    activePageIndex.value = 0
    clearHistory()
    selectedIds.value = []
    activeTextId.value = null
    activeImageId.value = null
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
      const rec = await storage.getFile(id)
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
    dash: s.dash,
    opacity: s.opacity,
    points: s.points.map((p) => ({ x: p.x, y: p.y, pressure: p.pressure })),
  })

  const snapshotText = (t: TextItem): TextItem => ({
    id: t.id,
    x: t.x,
    y: t.y,
    text: t.text,
    color: t.color,
    size: t.size,
  })

  const snapshotImage = (t: ImageItem): ImageItem => ({
    id: t.id,
    x: t.x,
    y: t.y,
    w: t.w,
    h: t.h,
    fileId: t.fileId,
  })

  const snapshotLayer = (l: Layer): Layer => ({
    id: l.id,
    name: l.name,
    visible: l.visible,
    strokes: l.strokes.map(snapshotStroke),
  })

  const persistNow = async (): Promise<void> => {
    try {
      const now = Date.now()
      const doc: PersistedDoc = {
        v: 5,
        savedAt: now,
        pages: pages.value.map((p) => ({
          id: p.id,
          layers: p.layers.map(snapshotLayer),
          activeLayerId: p.activeLayerId,
          texts: p.texts.map(snapshotText),
          images: p.images.map(snapshotImage),
          size: { w: p.size.w, h: p.size.h },
          ...(p.pdfPageIndex !== undefined ? { pdfPageIndex: p.pdfPageIndex } : {}),
        })),
        widths: { ...widths.value },
        activePageIndex: activePageIndex.value,
        ...(pdfId.value ? { pdfId: pdfId.value, pdfName: pdfName.value } : {}),
      }
      await storage.setDoc(doc)
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
    }, SAVE_DELAY)
    // Tüm içerik mutasyonları buradan geçer → thumbnail seridi kirlenir.
    // Görünüm-only op'lar (zoom/pan) buraya uğramaz, serit boşuna yanmaz.
    thumbTick.value += 1
  }

  // Thumbnail serit sürümü: her içerik mutasyonunda artar (component debounce'lu okur).
  const thumbTick = ref(0)

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
        tool: s.tool === 'eraser' || s.tool === 'highlighter' || isShapeTool(s.tool) ? s.tool : 'pen',
        color: typeof s.color === 'string' ? s.color : '#ffffff',
        width: typeof s.width === 'number' ? Math.min(120, Math.max(1, s.width)) : 3,
        dash: (s as Stroke).dash === 'dash' || (s as Stroke).dash === 'dot' ? (s as Stroke).dash : 'solid',
        opacity:
          typeof (s as Stroke).opacity === 'number' && Number.isFinite((s as Stroke).opacity)
            ? Math.min(1, Math.max(0.1, (s as Stroke).opacity))
            : 1,
        points: pts.map((p) => ({ x: p.x, y: p.y, pressure: p.pressure })),
      })
    }
    return clean
  }

  // Bozuk kayda karşı metin doğrulama (v2'de yok → boş; boş metinler atılır).
  const cleanTexts = (input: unknown): TextItem[] => {
    if (!Array.isArray(input)) return []
    const clean: TextItem[] = []
    for (const t of input) {
      if (!t || typeof t !== 'object') continue
      const r = t as Record<string, unknown>
      if (typeof r.text !== 'string' || r.text === '') continue
      if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) continue
      clean.push({
        id: typeof r.id === 'string' && r.id ? r.id : newStrokeId(),
        x: r.x as number,
        y: r.y as number,
        text: (r.text as string).slice(0, 2000),
        color: typeof r.color === 'string' ? r.color : '#ffffff',
        size:
          typeof r.size === 'number' && Number.isFinite(r.size)
            ? Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, Math.round(r.size)))
            : 24,
      })
    }
    return clean
  }

  // Bozuk kayda karşı resim doğrulama (v3'te yok → boş). Bitmap'siz kayıt
  // boyamada atlanır ama referans korunur (restore sessiz dener).
  const cleanImages = (input: unknown): ImageItem[] => {
    if (!Array.isArray(input)) return []
    const clean: ImageItem[] = []
    for (const t of input) {
      if (!t || typeof t !== 'object') continue
      const r = t as Record<string, unknown>
      if (typeof r.fileId !== 'string' || !r.fileId) continue
      if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) continue
      if (!Number.isFinite(r.w) || !Number.isFinite(r.h)) continue
      const w = Math.round(r.w as number)
      const h = Math.round(r.h as number)
      if (w < 16 || h < 16 || w > 3000 || h > 3000) continue
      clean.push({
        id: typeof r.id === 'string' && r.id ? r.id : newStrokeId(),
        x: r.x as number,
        y: r.y as number,
        w,
        h,
        fileId: r.fileId,
      })
    }
    return clean
  }

  // Bozuk kayda karşı katman doğrulama (v5; öncesi tek katmana sarılır).
  // Boş/geçersiz katman listesi → tek boş katman (boyama/seçim çökmesin).
  const cleanLayers = (input: unknown): Layer[] => {
    if (!Array.isArray(input)) return []
    const out: Layer[] = []
    for (const l of input) {
      if (!l || typeof l !== 'object') continue
      const r = l as Record<string, unknown>
      if (!Array.isArray(r.strokes)) continue
      out.push({
        id: typeof r.id === 'string' && r.id ? r.id : newStrokeId(),
        name: typeof r.name === 'string' && r.name ? r.name.slice(0, 40) : `Katman ${out.length + 1}`,
        visible: r.visible !== false,
        strokes: cleanStrokes(r.strokes as Stroke[]),
      })
    }
    return out
  }

  // Ham kayıt sayfası (sürümler arası şekil farkı — tip yalanına karşı bilinçli unknown).
  interface RawPage {
    id?: unknown
    strokes?: unknown
    layers?: unknown
    activeLayerId?: unknown
    texts?: unknown
    images?: unknown
    size?: unknown
    bgSize?: unknown
    pdfPageIndex?: unknown
  }

  const pageFromRaw = (p: RawPage, fallback: { w: number; h: number }): Page | null => {
    if (!p || typeof p !== 'object') return null
    const layers = cleanLayers(p.layers)
    if (layers.length === 0 && Array.isArray(p.strokes)) {
      // v2/v3/v4 göçü: tüm mürekkep tek katmana.
      layers.push(
        { id: newStrokeId(), name: 'Katman 1', visible: true, strokes: cleanStrokes(p.strokes as Stroke[]) },
      )
    }
    if (layers.length === 0) {
      // Metin/resim-sadece sayfa da sayfadır — boş katmanla yaşat.
      layers.push({ id: newStrokeId(), name: 'Katman 1', visible: true, strokes: [] })
    }
    const activeLayerId =
      typeof p.activeLayerId === 'string' && layers.some((l) => l.id === p.activeLayerId)
        ? p.activeLayerId
        : layers[0]!.id
    return {
      id: typeof p.id === 'string' && p.id ? p.id : newPageId(),
      layers,
      activeLayerId,
      texts: cleanTexts(p.texts),
      images: cleanImages(p.images),
      size: pageSizeOf(p, fallback),
      pdfPageIndex:
        typeof p.pdfPageIndex === 'number' && Number.isFinite(p.pdfPageIndex)
          ? Math.floor(p.pdfPageIndex)
          : undefined,
    }
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
      doc = await storage.getDoc()
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
    if ((doc.v === 2 || doc.v === 3 || doc.v === 4 || doc.v === 5) && Array.isArray(doc.pages)) {
      pages = doc.pages.length
      for (const raw of doc.pages as unknown as RawPage[]) {
        if (!raw || typeof raw !== 'object') continue
        if (Array.isArray(raw.strokes)) strokes += raw.strokes.length
        if (Array.isArray(raw.texts)) strokes += raw.texts.length
        if (Array.isArray(raw.images)) strokes += raw.images.length
        if (Array.isArray(raw.layers)) {
          for (const l of raw.layers as { strokes?: unknown }[]) {
            if (l && Array.isArray(l.strokes)) strokes += l.strokes.length
          }
        }
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
      doc = await storage.getDoc()
    } catch {
      return false
    }
    if (!doc || typeof doc.v !== 'number') return false
    // widths her sürümde ortak
    const w = (doc as { widths?: unknown }).widths as Record<string, unknown> | undefined
    if (w) {
      for (const t of ['pen', 'highlighter', 'eraser', 'line', 'rect', 'ellipse', 'arrow', 'text', 'image', 'hand'] as const) {
        const v = w[t]
        if (typeof v === 'number' && Number.isFinite(v)) {
          widths.value[t] = Math.min(WIDTH_MAX[t], Math.max(WIDTH_MIN[t], Math.round(v)))
        }
      }
    }
    let loaded: Page[] | null = null
    const viewFallback = {
      w: canvasRef.value?.clientWidth || FALLBACK_VIEWPORT.w,
      h: canvasRef.value?.clientHeight || FALLBACK_VIEWPORT.h,
    }
    if ((doc.v === 2 || doc.v === 3 || doc.v === 4 || doc.v === 5) && Array.isArray(doc.pages)) {
      const clean = (doc.pages as unknown as RawPage[])
        .map((p) => pageFromRaw(p, viewFallback))
        .filter((p): p is Page => p !== null)
      loaded = clean.length > 0 ? clean : null
    } else if (doc.v === 1 && Array.isArray((doc as { strokes?: unknown }).strokes)) {
      const v1 = (doc as unknown as { strokes: Stroke[] }).strokes
      const clean = cleanStrokes(v1)
      loaded = clean.length > 0 ? [singleLayerPage(newPageId(), clean, { ...viewFallback })] : null
    }
    if (!loaded || loaded.length === 0) return false
    pages.value = loaded
    savedSession.value = null
    clearHistory()
    selectedIds.value = []
    activeTextId.value = null
    activeImageId.value = null
    const idx = (doc as { activePageIndex?: unknown }).activePageIndex
    activePageIndex.value =
      typeof idx === 'number' && Number.isFinite(idx)
        ? Math.min(loaded.length - 1, Math.max(0, Math.floor(idx)))
        : 0
    layoutView()
    // PDF kaydı varsa arkaplanları bytes'tan yeniden üret (yoksa mürekkep tek başına durur).
    if ((doc.v === 2 || doc.v === 3 || doc.v === 4 || doc.v === 5) && doc.pdfId) {
      pdfId.value = doc.pdfId
      pdfName.value = doc.pdfName ?? ''
      await restorePdfBackgrounds(doc.pdfId)
    } else {
      pdfId.value = null
      pdfName.value = ''
    }
    await restoreImageBitmaps()
    recountActive()
    lastSavedAt.value = fmtTime(doc.savedAt)
    repaintBase()
    return true
  }

  // ✅ Geri al — snapshot history'den (tüm yapısal op'lar: mürekkep/silgi/taşı/yapıştır/metin/resim/katman/sayfa).
  const undoLastStroke = () => {
    const prev = undoStack.value.pop()
    if (!prev) return
    // Kullanıcının şu anki sayfasını koru: undo görünümü başka sayfaya atlatmasın.
    const keepPageId = activePage.value.id
    redoStack.value.push(snapshotDoc())
    if (redoStack.value.length > HISTORY_CAP) redoStack.value.shift()
    restoreDoc(prev)
    const kept = pages.value.findIndex((p) => p.id === keepPageId)
    activePageIndex.value = kept !== -1 ? kept : activePageIndex.value
    flushFileDeletes()
    selectedIds.value = []
    activeTextId.value = null
    activeImageId.value = null
    points.value = []
    isDrawing.value = false
    repaintBase()
    clearOverlay()
    bb = null
    recountActive()
    scheduleSave()
  }

  // ✅ Yinele — ileri snapshot'a döner.
  const redo = (): boolean => {
    const next = redoStack.value.pop()
    if (!next) return false
    const keepPageId = activePage.value.id
    undoStack.value.push(snapshotDoc())
    if (undoStack.value.length > HISTORY_CAP) undoStack.value.shift()
    restoreDoc(next)
    const kept = pages.value.findIndex((p) => p.id === keepPageId)
    activePageIndex.value = kept !== -1 ? kept : activePageIndex.value
    flushFileDeletes()
    selectedIds.value = []
    activeTextId.value = null
    activeImageId.value = null
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
    // Sayfa değişimi seçimi öldürür; redo YAŞAR (snapshot tüm belgeyi tutar).
    selectedIds.value = []
    activeTextId.value = null
    activeImageId.value = null
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
    pushHistory()
    pages.value.push(blankPage())
    goToPage(pages.value.length - 1)
    scheduleSave()
  }

  // Aktif sayfayı arkaya kopyalar (taze id'ler; PDF bitmap + resim bytes paylaşılır).
  const duplicatePage = (): boolean => {
    const src = activePage.value
    const idx = activePageIndex.value
    pushHistory()
    const layerId = new Map<string, string>()
    const layers = src.layers.map((l) => {
      const nid = newStrokeId()
      layerId.set(l.id, nid)
      return { id: nid, name: l.name, visible: l.visible, strokes: l.strokes.map(snapshotStroke) }
    })
    const np: Page = {
      id: newPageId(),
      layers,
      activeLayerId: layerId.get(src.activeLayerId) ?? layers[0]!.id,
      texts: src.texts.map((t) => ({ ...snapshotText(t), id: newStrokeId() })),
      images: src.images.map((m) => ({ ...snapshotImage(m), id: newStrokeId() })),
      size: { w: src.size.w, h: src.size.h },
      ...(src.pdfPageIndex !== undefined ? { pdfPageIndex: src.pdfPageIndex } : {}),
    }
    if (src.pdfPageIndex !== undefined) {
      const bmp = bgCanvases.get(src.id)
      if (bmp) bgCanvases.set(np.id, bmp)
      const sc = pdfRenderScales.get(src.id)
      if (sc !== undefined) pdfRenderScales.set(np.id, sc)
    }
    pages.value.splice(idx + 1, 0, np)
    goToPage(idx + 1)
    return true
  }

  // Aktif sayfayı sola/sağa taşır (seçim korunur — aynı sayfa aktif kalır).
  const movePageActive = (dir: 1 | -1): boolean => {
    const i = activePageIndex.value
    const j = i + dir
    if (j < 0 || j >= pages.value.length) return false
    pushHistory()
    const arr = pages.value
    const tmp = arr[i]!
    arr[i] = arr[j]!
    arr[j] = tmp
    activePageIndex.value = j
    layoutView()
    recountActive()
    repaintBase()
    clearOverlay()
    scheduleSave()
    return true
  }

  // Silinen aktifse komşuya geçilir. Son sayfa silinemez. Veri kaybına karşı
  // component confirm() sorar (silme history'den geri alınabilir).
  const deletePage = (i: number): boolean => {
    if (pages.value.length <= 1) return false
    const clamped = Math.min(pages.value.length - 1, Math.max(0, Math.floor(i)))
    pushHistory()
    const [removed] = pages.value.splice(clamped, 1)
    if (removed) {
      bgCanvases.delete(removed.id)
      pdfRenderScales.delete(removed.id)
      queueFileDeletes(removed.images.map((i) => i.fileId))
    }
    selectedIds.value = []
    activeTextId.value = null
    activeImageId.value = null
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
    locale,
    setLocale,
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
    hasInk,
    pages,
    activePage,
    activePageIndex,
    goToPage,
    addPage,
    deletePage,
    duplicatePage,
    movePageActive,
    setPageBackground,
    clearPageBackground,
    exportPageToCanvas,
    thumbTick,
    zoomLabel,
    zoomBy,
    panBy,
    pinch,
    resetView,
    zoomStep,
    cancelActiveStroke,
    getViewTransform,
    eventToPage,
    dpr,
    setTool,
    setColor,
    palettes,
    activePaletteId,
    activePalette,
    setActivePalette,
    addPalette,
    renamePalette,
    deletePalette,
    addColorToPalette,
    removeColorFromPalette,
    appendCustomsToPalette,
    customColors,
    addCustomColor,
    setCustomSlot,
    removeCustomColor,
    setStrokeWidth,
    setRejectTouch,
    touchPan,
    setTouchPan,
    smoothing,
    setSmoothing,
    strokeDash,
    setStrokeDash,
    strokeOpacity,
    setStrokeOpacity,
    eraserMode,
    setEraserMode,
    selectMode,
    setSelectMode,
    selectedIds,
    selectionCount,
    isSelected,
    clearSelection,
    selectRectArea,
    selectLassoArea,
    selectAll,
    deleteSelected,
    moveSelected,
    activeLayer,
    addLayer,
    deleteLayer,
    renameLayer,
    setActiveLayer,
    toggleLayerVisible,
    moveLayer,
    clipboardCount,
    copySelected,
    cutSelected,
    pasteClipboard,
    textSize,
    setTextSize,
    activeTextId,
    activeText,
    clearActiveText,
    textAt,
    createText,
    updateText,
    updateTextStyle,
    moveText,
    deleteText,
    activeImageId,
    activeImage,
    imageAt,
    moveImage,
    resizeImage,
    deleteImage,
    imgBusy,
    addImage,
    toolbarOrder,
    hiddenTools,
    setToolVisible,
    moveTool,
    resetToolbar,
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
    undoStack,
    pushHistory,
    pushHistoryKeyed,
    endHistoryGroup,
    pdfBusy,
    pdfId,
    pdfName,
    importPdf,
    closePdf,
    buildPdfDocument,
    exportPdf,
    buildCalemJSON,
    exportCalem,
    importCalem,
    resizeCanvas,
  }
})
