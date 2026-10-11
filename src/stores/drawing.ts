import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { storage, type ImageFileRecord, type PersistedDoc } from '../lib/idb'
import {
  cleanCustomList,
  cleanHexColor,
  cleanPalettes,
  cleanToolbar,
  cleanUiScale,
  loadStoredSettings,
  migrateEraserFirst,
  migrateToolbarHand,
  saveStoredSettings,
} from '../persist/settingsStorage'
import {
  cleanPaperBackground,
  cornellLayout,
  dottedPoints,
  graphLineXs,
  isometricLines,
  marginLineX,
  plannerLayout,
  ruledLineYs,
  staffLineYs,
  type PaperBackground,
  type PaperBackgroundType,
} from '../lib/paper'
import {
  coalescedOf,
  expandRect,
  rectAround,
  rectsOverlap,
  normRect,
  selectByLasso as selByLasso,
  selectByRect as selByRect,
  subRunsInRect,
  unionRect,
  type NormRect,
} from '../lib/select'
import { dropTinyRuns, polylineHitsCircle, splitRunsOutside } from '../lib/erase'
import { cachedStrokeBBox, invalidateStrokeBBox } from '../lib/strokeBounds'
import { capBackingScale } from '../lib/canvasLimits'
import {
  newStrokeId,
  newPageId,
  snapshotImage,
  snapshotLayer,
  snapshotStroke,
  snapshotText,
  snapshotDoc as makeSnapshotDoc,
  restoreDocSnapshot,
  type DocSnap,
} from '../persist/snapshot'
import { takeObsoletePdfIds } from '../persist/pdfFileCleanup'
import { isLatestSave } from '../persist/saveRevision'
import {
  buildPersistedDoc,
  summarizePersistedDoc,
  deserializePersistedDoc,
} from '../persist/docPersistence'
import {
  bytesToCanvas,
  fitImageDimensions,
  placeImageInBounds,
  restoreBitmapsFromStorage,
  collectReferencedImageFileIds,
  deleteImageFilesOf as removeImageFiles,
  isImageFile,
} from '../lib/imagePipeline'
import {
  cleanImages,
  cleanLayers,
  cleanStrokes,
  cleanTexts,
  pageFromRaw as sanitizePageFromRaw,
  pageSizeOf,
  type RawPage,
} from '../persist/pageSanitizer'
import { dashFor, effectiveWidth, paintStroke } from '../render/strokes'
import { wrapTextToWidth } from '../lib/text'
import { estimateLines, textBBoxOf } from '../lib/text'
import { fitContain, needsPdfRerender, shapeEndpoints } from '../lib/geometry'
import { recognizeShape } from '../lib/shapeRecognition'
import { exportXoppBytes, importXoppBytes } from '../lib/xopp'
import { renderPdfPages, renderPdfPageAt, type RenderedPdfPage } from '../lib/pdf'
import {
  bufToB64,
  b64ToBuf,
  writeCalemToHandle,
  type CalemFileHandle,
} from '../lib/calemFile'
import {
  hexToRgb,
  paintStrokeVector,
  paintStrokesVector,
  paintPatternVector,
  paintTextsVector,
  type PdfDoc,
} from '../render/pdfExport'
import { calemFileName, pdfFileName, xoppFileName } from '../config/files'
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
import { SLIDERS } from '../config/ui'

import type {
  AppSettings,
  CalemFile,
  ColorPalette,
  DashStyle,
  EraserMode,
  ImageItem,
  Layer,
  Page,
  Point,
  SelectMode,
  ShapeTool,
  Stroke,
  TextItem,
  Tool,
  ToolbarConfig,
  UiTheme,
} from '../model/document'
import { drawingPerf, isShapeTool, TEXT_SIZE_MAX, TEXT_SIZE_MIN } from '../model/document'

// A4 punto — boş sayfaların varsayılan boyutu.
// Sayfa arkaplan bitmap'leri: sayfa id → render edilmiş canvas. Persist edilmez,
// PDF bytes'larından yeniden üretilir. Aspect her zaman page.size ile aynıdır (inşa gereği).
// Kısmi repaint'te stroke seçim payı (page-pt): en kalın fırça bleed'ini kapsar.
const DIRTY_STROKE_MARGIN = WIDTH_MAX.highlighter * 0.8

const bgCanvases = new Map<string, HTMLCanvasElement>()

// Resim bitmap'leri: fileId → decode edilmiş canvas. Persist edilmez,
// IDB files deposundaki bytes'tan üretilir (PDF arkaplan deseni).
const imgBitmaps = new Map<string, HTMLCanvasElement>()

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
  // Silgi kirli kutusu (SAYFA uzayı): hareket boyunca birikir, rAF'te tek KISMİ repaint'e
  // dönüşür. Tam-sayfa repaint yerine yalnız değişen bölge raster'lanır (darboğaz buradaydı).
  let eraseDirty: NormRect | null = null
  let eraseRaf = 0
  // Hızlı silgi önizlemesi (opak kâğıt): sürüklemede her hareket için kısmi repaint
  // yerine base'e doğrudan kâğıt rengi boyanır (O(1)/hareket). Gerçek veri kesimi
  // bırakışta bir kez uygulanır + tek tam repaint. Yoğun mürekkepte asıl darboğaz buydu.
  let fastErase = false
  let erasePath: { x: number; y: number }[] = []
  let eraseFastLast: { x: number; y: number } | null = null
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

  const setPageFormat = (f: string): boolean => {
    if (f !== 'custom' && !(f in PAGE_FORMATS)) return false
    pageFormat.value = f as PageFormat
    void persistSettings()
    return applySizeToBlankActivePage()
  }

  const setPageOrientation = (o: string): boolean => {
    if (o !== 'portrait' && o !== 'landscape') return false
    pageOrientation.value = o
    void persistSettings()
    return applySizeToBlankActivePage()
  }

  const setCustomSize = (w: number, h: number): boolean => {
    if (!Number.isFinite(w) || !Number.isFinite(h)) return false
    customW.value = Math.min(PAGE_MAX, Math.max(PAGE_MIN, Math.round(w)))
    customH.value = Math.min(PAGE_MAX, Math.max(PAGE_MIN, Math.round(h)))
    void persistSettings()
    return applySizeToBlankActivePage()
  }

  // Aktif sayfa boşsa (mürekkep/metin/resim yok, PDF değil) yeni ölçüyü
  // anında uygular: yön/biçim değişimi boş sayfada anlık görünür.
  // Dolu sayfalar korunur (ayar sonraki sayfalara işler). Uygulandıysa true.
  const isPageBlank = (p: Page): boolean => {
    if (p.pdfPageIndex !== undefined && p.pdfPageIndex !== null) return false
    if ((p.texts?.length ?? 0) > 0 || (p.images?.length ?? 0) > 0) return false
    return (p.layers ?? []).every((l) => (l.strokes?.length ?? 0) === 0)
  }

  const applySizeToBlankActivePage = (): boolean => {
    const p = activePage.value
    if (!p || !isPageBlank(p)) return false
    p.size = defaultPageSize()
    layoutView()
    repaintBase()
    clearOverlay()
    scheduleSave()
    return true
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

  // Arayüz ölçeği: Tailwind rem tabanlı olduğundan kök font-size tüm chrome'u
  // orantılı büyütür/küçültür; canvas piksel matematiği etkilenmez.
  const uiScale = ref(1)
  const applyUiScale = () => {
    if (typeof document === 'undefined' || !document.documentElement) return
    document.documentElement.style.fontSize = `${16 * uiScale.value}px`
  }
  const setUiScale = (v: number) => {
    const c = cleanUiScale(v)
    if (c === null || c === uiScale.value) return
    uiScale.value = c
    applyUiScale()
    void persistSettings()
  }

  // Sayfa şeridi (çok sayfalı küçük resimler): varsayılan kapalı, tercih saklanır.
  const pageStripOpen = ref(false)
  const setPageStripOpen = (v: boolean) => {
    const next = !!v
    if (pageStripOpen.value === next) return
    pageStripOpen.value = next
    void persistSettings()
  }

  // --- Toolbar konfigürasyonu: sıra + gizli araçlar ---
  const toolbarOrder = ref<Tool[]>([...ALL_TOOLS])
  const hiddenTools = ref<Tool[]>([])

  const persistSettings = async (): Promise<void> => {
    const doc: AppSettings = {
      v: 6,
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
      uiScale: uiScale.value,
      pageStripOpen: pageStripOpen.value,
      autoShapeSnap: autoShapeSnap.value,
    }
    await saveStoredSettings(doc)
  }

  // Ayar yedeği: indirilen JSON'u başka cihaza/tarayıcıya taşımak için.
  const exportSettingsJSON = (): string => {
    const doc: AppSettings = {
      v: 6,
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
        uiScale: uiScale.value,
        pageStripOpen: pageStripOpen.value,
        autoShapeSnap: autoShapeSnap.value,
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
      // v6 öncesi dizilimde vurgu silginin solundadır → çifti değiştir.
      const needsEraserFix = typeof r.v !== 'number' || (r.v as number) < 6
      const handFixed = needsHandFix ? migrateToolbarHand(tb.order) : tb.order
      toolbarOrder.value = needsEraserFix ? migrateEraserFirst(handFixed) : handFixed
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
    const sc = cleanUiScale(r.uiScale)
    if (sc !== null) {
      uiScale.value = sc
      applied = true
    }
    if (typeof r.pageStripOpen === 'boolean') {
      pageStripOpen.value = r.pageStripOpen
      applied = true
    }
    if (!applied) return false
    applyUiTheme()
    applyLocale()
    applyUiScale()
    await persistSettings()
    if (canvasRef.value) {
      repaintBase()
      clearOverlay()
    }
    return true
  }

  const loadSettings = async (): Promise<void> => {
    try {
      // IDB beklenmeden önce eldeki değerleri uygula: flaş yok, her ortamda deterministik.
      applyUiTheme()
      applyLocale()
      applyUiScale()
      const raw = await loadStoredSettings()
      // Kayıt yoksa bile temayı/dili uygula: data-theme + lang hep yazılır.
      if (!raw) {
        applyUiTheme()
        applyLocale()
        applyUiScale()
        return
      }
      if (typeof raw.paper === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.paper)) {
        paper.value = raw.paper
      }
      if ((raw.v === 2 || raw.v === 3 || raw.v === 4 || raw.v === 5 || raw.v === 6) && raw.background !== undefined) {
        paperBackground.value = cleanPaperBackground(raw.background)
      }
      if ((raw.v === 3 || raw.v === 4 || raw.v === 5 || raw.v === 6) && (raw.eraserMode === 'standard' || raw.eraserMode === 'stroke')) {
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
        const handFixed = raw.v < 5 ? migrateToolbarHand(tb.order) : tb.order
        // v6 öncesi dizilimde vurgu silginin solundadır → çifti değiştir.
        toolbarOrder.value = raw.v < 6 ? migrateEraserFirst(handFixed) : handFixed
        hiddenTools.value = tb.hidden
      }
      if (raw.format === 'custom' || (typeof raw.format === 'string' && raw.format in PAGE_FORMATS)) {
        pageFormat.value = raw.format as PageFormat
      }
      if (raw.orientation === 'portrait' || raw.orientation === 'landscape') {
        pageOrientation.value = raw.orientation
      }
      if (Number.isFinite(raw.customW) && Number.isFinite(raw.customH)) {
        customW.value = Math.min(PAGE_MAX, Math.max(PAGE_MIN, Math.round(raw.customW as number)))
        customH.value = Math.min(PAGE_MAX, Math.max(PAGE_MIN, Math.round(raw.customH as number)))
      }
      if (raw.uiTheme === 'koyu' || raw.uiTheme === 'acik') {
        uiTheme.value = raw.uiTheme
      }
      if (isLocale(raw.locale)) {
        locale.value = raw.locale
      }
      const rawScale = cleanUiScale(raw.uiScale)
      if (rawScale !== null) {
        uiScale.value = rawScale
      }
      if (typeof raw.pageStripOpen === 'boolean') {
        pageStripOpen.value = raw.pageStripOpen
      }
      if (typeof raw.autoShapeSnap === 'boolean') {
        autoShapeSnap.value = raw.autoShapeSnap
      }
      applyUiTheme()
      applyLocale()
      applyUiScale()
    } catch {
      /* varsayılanlar */
    }
  }
  const color = ref('#ffffff')
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
  // Kaydırmalı modda canlı canvas: slot zaten zoom'lu boyutta olduğundan boya yolu
  // zoom'u bir kez sayar (slot + paint çift saymasın). Tekli modda etkisiz.
  let scrollLive = false
  const ze = () => (scrollLive ? 1 : viewZoom)
  const zoomFactor = ref(1)
  const zoomLabel = ref('100%')
  // Zoom kelepçesi: config/engine (ZOOM_MIN/ZOOM_MAX).
  const effScale = () => (viewScale || 1) * ze()
  const effOx = () => viewOx * ze() + viewPanX
  const effOy = () => viewOy * ze() + viewPanY
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
    zoomFactor.value = viewZoom
    zoomLabel.value = `${Math.round(viewZoom * 100)}%`
  }

  const clampPan = () => {
    const c = canvasRef.value
    if (!c) return
    viewPanX = Math.min(c.clientWidth, Math.max(-c.clientWidth, viewPanX))
    viewPanY = Math.min(c.clientHeight, Math.max(-c.clientHeight, viewPanY))
  }

  // İç çekirdek: verilen ekran noktasının altındaki sayfa noktası sabit kalır.
  // Okuma terimleri telafili (ze): kaydırmalı modda slot zaten zoom'lu boyutta.
  // Yazım terimleri (nz) hedef state'i tutar; slot reflow sonrası ankraj yaklaşık olur.
  const applyZoomAt = (nz: number, cx: number, cy: number) => {
    const fs = viewScale || 1
    const es = fs * ze()
    const px = (cx - (viewOx * ze() + viewPanX)) / es
    const py = (cy - (viewOy * ze() + viewPanY)) / es
    viewZoom = nz
    viewPanX = cx - (px * fs * nz + viewOx * nz)
    viewPanY = cy - (py * fs * nz + viewOy * nz)
  }

  // Kaydırmalı modda çapa görünüm katmanındadır (useScrollMode: imleç altındaki
  // layout noktası + scroll kompanzasyonu). Burada yalnızca oran kurulur;
  // yerleşim+boya rAF watcher'ındır. viewPan scroll modda daima sıfırdır.
  // İmleç/pinch-merkezi sabitli zoom. Tek repaint.
  const zoomBy = (factor: number, cx: number, cy: number) => {
    if (!(factor > 0) || !Number.isFinite(factor) || !Number.isFinite(cx) || !Number.isFinite(cy)) return
    const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, viewZoom * factor))
    if (nz === viewZoom) return
    if (scrollLive) {
      viewZoom = nz
      syncZoomLabel()
      scheduleRerender()
      return
    }
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
    if (scrollLive) {
      if (nz !== viewZoom && Number.isFinite(midX) && Number.isFinite(midY)) {
        viewZoom = nz
        syncZoomLabel()
        scheduleRerender()
      }
      // Saf iki-parmak öteleme: boya-pan YOK — çağıran native scroll'u sürer.
      return
    }
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
    // Kaydırmalı modda senkron boya yok (eski geometriyle bir kare titrerdi);
    // rAF watcher konumlandırıp boyar.
    if (scrollLive) {
      scheduleRerender()
      return
    }
    repaintBase()
    clearOverlay()
  }

  // Kaydırmalı mod canlı canvas bayrağı: mod değişiminde view çağrılır,
  // pan sıfırlanır (farklı geometriye eski pan taşınmaz).
  const setScrollLive = (v: boolean) => {
    scrollLive = v
    viewPanX = 0
    viewPanY = 0
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

  const undoStack = ref<DocSnap[]>([])
  const redoStack = ref<DocSnap[]>([])
  // Derinlik: config/engine (HISTORY_CAP).

  const snapshotDoc = (): DocSnap => makeSnapshotDoc(pages.value, activePageIndex.value)

  const restoreDoc = (s: DocSnap) => {
    const res = restoreDocSnapshot(s)
    pages.value = res.pages
    activePageIndex.value = res.activePageIndex
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
    const r = normRect(a.x, a.y, b.x, b.y)
    const visibleStrokes = activePage.value.layers.filter((layer) => layer.visible).flatMap((layer) => layer.strokes)
    selectedIds.value = [
      ...selByRect(visibleStrokes, a, b),
      ...visibleImages().filter((img) => rectsOverlap(r, { x0: img.x, y0: img.y, x1: img.x + img.w, y1: img.y + img.h })).map((img) => img.id),
    ]
    return selectedIds.value.length
  }
  const selectLassoArea = (poly: { x: number; y: number }[]): number => {
    const xs = poly.map((p) => p.x)
    const ys = poly.map((p) => p.y)
    const box = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
    const visibleStrokes = activePage.value.layers.filter((layer) => layer.visible).flatMap((layer) => layer.strokes)
    selectedIds.value = [
      ...selByLasso(visibleStrokes, poly),
      ...visibleImages().filter((img) => rectsOverlap(box, { x0: img.x, y0: img.y, x1: img.x + img.w, y1: img.y + img.h })).map((img) => img.id),
    ]
    return selectedIds.value.length
  }
  const selectAll = (): number => {
    selectedIds.value = [...activePage.value.layers.filter((layer) => layer.visible).flatMap((layer) => layer.strokes.map((s) => s.id)), ...visibleImages().map((img) => img.id)]
    return selectedIds.value.length
  }
  // Seçiliyi sil: yapısal op — redo ölür, base baştan boyanır, autosave kuyruğa girer.
  const deleteSelected = (): number => {
    if (selectedIds.value.length === 0) return 0
    const set = new Set(selectedIds.value)
    let removed = 0
    const removedImages = visibleImages().filter((img) => set.has(img.id))
    const removedImageIds = new Set(removedImages.map((img) => img.id))
    pushHistory()
    for (const img of removedImages) brushDirty({ x0: img.x, y0: img.y, x1: img.x + img.w, y1: img.y + img.h })
    queueFileDeletes(removedImages.map((img) => img.fileId))
    for (const layer of activePage.value.layers) {
      const before = layer.strokes.length
      layer.strokes = layer.strokes.filter((s) => !set.has(s.id))
      removed += before - layer.strokes.length
    }
    activePage.value.images = activePage.value.images.filter((img) => !removedImageIds.has(img.id))
    selectedIds.value = []
    activeTextId.value = null
    activeImageId.value = null
    recountActive()
    if (removedImages.length) scheduleEraseRepaint()
    else repaintBase()
    clearOverlay()
    scheduleSave()
    return removed + removedImages.length
  }
  // Seçiliyi ötele (sayfa-uzayı delta): şekli bozmamak için delta, seçim kutusu
  // sayfada kalacak şekilde kelepçelenir, tüm noktalara AYNI delta uygulanır.
  // Yapısal op: redo ölür, save kuyruğa girer. Seçim korunur (zincir taşıma için).
  const moveSelected = (dx: number, dy: number): boolean => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false
    if (selectedIds.value.length === 0) return false
    const set = new Set(selectedIds.value)
    const size = activePage.value.size
    const movedStrokes = activePage.value.layers.flatMap((layer) => layer.strokes).filter((s) => set.has(s.id))
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    let hasStroke = false
    const movedImages = visibleImages().filter((img) => set.has(img.id))
    for (const img of movedImages) {
      x0 = Math.min(x0, img.x)
      y0 = Math.min(y0, img.y)
      x1 = Math.max(x1, img.x + img.w)
      y1 = Math.max(y1, img.y + img.h)
    }
    for (const s of movedStrokes) {
      const bounds = cachedStrokeBBox(s)
      if (!bounds) continue
      hasStroke = true
      const pad = Math.max(s.width / 2, 2)
      x0 = Math.min(x0, bounds.x0 + pad)
      y0 = Math.min(y0, bounds.y0 + pad)
      x1 = Math.max(x1, bounds.x1 - pad)
      y1 = Math.max(y1, bounds.y1 - pad)
    }
    if (!hasStroke && movedImages.length === 0) {
      selectedIds.value = []
      return false
    }
    dx = Math.min(size.w - x1, Math.max(-x0, dx))
    dy = Math.min(size.h - y1, Math.max(-y0, dy))
    if (!dx && !dy) return false
    const oldBounds = { x0, y0, x1, y1 }
    for (const s of movedStrokes) {
      for (const p of s.points) {
        p.x += dx
        p.y += dy
      }
      invalidateStrokeBBox(s)
    }
    for (const img of movedImages) {
      img.x += dx
      img.y += dy
    }
    // Seçim korunur (zincir taşıma için).
    recountActive()
    brushDirty(oldBounds)
    brushDirty({ x0: oldBounds.x0 + dx, y0: oldBounds.y0 + dy, x1: oldBounds.x1 + dx, y1: oldBounds.y1 + dy })
    scheduleEraseRepaint()
    return true
  }
  // Pano: sayfalar-arası çalışır, içerik idsiz saklanır (yapıştırma yeni id verir).
  // Reaktivite dışı; buton durumu için sayacı ayrıca senkronlanır.
  let clipboard: { strokes: Omit<Stroke, 'id'>[]; images: Omit<ImageItem, 'id'>[] } = { strokes: [], images: [] }
  const clipboardCount = ref(0)
  const copySelected = (): number => {
    if (selectedIds.value.length === 0) return 0
    const set = new Set(selectedIds.value)
    clipboard = {
      strokes: activePage.value.layers.flatMap((layer) => layer.strokes)
        .filter((s) => set.has(s.id))
        .map((s) => ({
        tool: s.tool,
        color: s.color,
        width: s.width,
        dash: s.dash,
        opacity: s.opacity,
        points: s.points.map((p) => ({ x: p.x, y: p.y, pressure: p.pressure })),
        })),
      images: visibleImages().filter((img) => set.has(img.id)).map(({ id: _id, ...img }) => ({ ...img })),
    }
    clipboardCount.value = clipboard.strokes.length + clipboard.images.length
    return clipboardCount.value
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
    if (clipboardCount.value === 0) return 0
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0
    const size = activePage.value.size
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const s of clipboard.strokes) {
      for (const p of s.points) {
        if (p.x < x0) x0 = p.x
        if (p.y < y0) y0 = p.y
        if (p.x > x1) x1 = p.x
        if (p.y > y1) y1 = p.y
      }
    }
    for (const img of clipboard.images) {
      x0 = Math.min(x0, img.x)
      y0 = Math.min(y0, img.y)
      x1 = Math.max(x1, img.x + img.w)
      y1 = Math.max(y1, img.y + img.h)
    }
    if (!Number.isFinite(x0) || !Number.isFinite(y0)) return 0
    dx = Math.min(size.w - x1, Math.max(-x0, dx))
    dy = Math.min(size.h - y1, Math.max(-y0, dy))
    const pasted: Stroke[] = clipboard.strokes.map((s) => ({
      id: newStrokeId(),
      tool: s.tool,
      color: s.color,
      width: s.width,
      dash: s.dash,
      opacity: s.opacity,
      points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy, pressure: p.pressure })),
    }))
    if (pasted.length === 0 && clipboard.images.length === 0) return 0
    pushHistory()
    for (const s of pasted) activeLayer.value.strokes.push(s)
    const pastedImages = clipboard.images.map((img) => ({ ...img, id: newStrokeId(), layerId: activePage.value.activeLayerId, x: img.x + dx, y: img.y + dy }))
    activePage.value.images.push(...pastedImages)
    selectedIds.value = [...pasted.map((s) => s.id), ...pastedImages.map((img) => img.id)]
    recountActive()
    repaintBase()
    clearOverlay()
    scheduleSave()
    return pasted.length + pastedImages.length
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
    if (activeTextId.value) {
      activeTextId.value = null
      repaintBase()
    }
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
  const createText = (x: number, y: number, w?: number): string => {
    const size = activePage.value.size
    const boxW =
      typeof w === 'number' && Number.isFinite(w) && w >= 40 ? Math.min(size.w, Math.round(w)) : undefined
    const item: TextItem = {
      id: newStrokeId(),
      x: Math.min(size.w - 8, Math.max(0, x)),
      y: Math.min(size.h - 8, Math.max(0, y)),
      text: '',
      color: color.value,
      size: textSize.value,
      ...(boxW !== undefined ? { w: boxW } : {}),
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
  const visibleImages = (page = activePage.value): ImageItem[] => {
    const visibleLayerIds = new Set(page.layers.filter((layer) => layer.visible).map((layer) => layer.id))
    return page.images.filter((img) => visibleLayerIds.has(img.layerId))
  }
  const activeImage = (): ImageItem | null => {
    if (!activeImageId.value) return null
    return activePage.value.images.find((t) => t.id === activeImageId.value) ?? null
  }
  // Tıklanan noktadaki en üst resim.
  const imageAt = (x: number, y: number): ImageItem | null => {
    const items = visibleImages()
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
    if (lastPushKey !== 'image-drag') {
      pushHistory()
      lastPushKey = 'image-drag'
    }
    const old = { x0: img.x, y0: img.y, x1: img.x + img.w, y1: img.y + img.h }
    img.x = nx
    img.y = ny
    brushDirty(old)
    brushDirty({ x0: nx, y0: ny, x1: nx + img.w, y1: ny + img.h })
    scheduleEraseRepaint()
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
    activePage.value.images.splice(activePage.value.images.findIndex((t) => t.id === id), 1)
    queueFileDeletes([img.fileId])
    if (activeImageId.value === id) activeImageId.value = null
    // Bytes SİLİNMEZ: undo referansı geri getirebilir (tekil silinti yetimleri IDB'de kalır).
    recountActive()
    brushDirty({ x0: img.x, y0: img.y, x1: img.x + img.w, y1: img.y + img.h })
    scheduleEraseRepaint()
    clearOverlay()
    scheduleSave()
    return true
  }



  // --- Resim import pipeline: dosya → decode → cap → IDB → sayfaya yerleştir ---
  // Bitmap cap'i: config/engine (IMAGE_MAX_DIM, oran korunur).
  const imgBusy = ref(false)

  // Tıklanan noktaya ortalanmış yerleştirir (taşma payı moveImage sınırlarında).
  const addImage = async (
    file: File,
    x: number,
    y: number,
  ): Promise<{ id: string } | { error: string }> => {
    if (imgBusy.value) return { error: 'işlem sürüyor' }
    if (!isImageFile(file)) return { error: 'resim dosyası seç' }
    imgBusy.value = true
    try {
      const buf = await file.arrayBuffer()
      const canvas = await bytesToCanvas(buf)
      if (!canvas) return { error: 'resim okunamadı' }
      const fileId = `img-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
      const size = activePage.value.size
      const { w, h } = fitImageDimensions(canvas.width, canvas.height, Math.max(64, size.w - 16))
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
      const pos = placeImageInBounds(x, y, w, h, size)
      const item: ImageItem = {
        id: newStrokeId(),
        layerId: activePage.value.activeLayerId,
        x: pos.x,
        y: pos.y,
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
    await restoreBitmapsFromStorage(pages.value, imgBitmaps, storage)
  }

  // Sayfa(lar) çöpe giderken yetim bytes bırakma (yükleme yolu hariç — orada referans yeni doc'ta).
  // SADECE geri alınamaz bağlamlarda (import/kapat) çağrılır; undo kapsamındakiler queueFileDeletes.
  const deleteImageFilesOf = (pages: Page[], keepIds?: Set<string>) => {
    removeImageFiles(pages, imgBitmaps, storage, keepIds)
  }

  // Undo kapsamındaki resim bytes'ları hemen atılmaz: snapshot'lar hâlâ o dosyaya
  // referans verebilir. Referans kalmayınca (history'den düşünce) süpürülür —
  // böylece Temizle/sayfa-sil sonrası Undo resmi bozuk getirmez.
  const pendingFileDeletes = new Set<string>()

  const referencedImageFileIds = (): Set<string> =>
    collectReferencedImageFileIds(pages.value, undoStack.value, redoStack.value)

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
    const removedImages = p.images.filter((img) => img.layerId === id)
    queueFileDeletes(removedImages.map((img) => img.fileId))
    p.images = p.images.filter((img) => img.layerId !== id)
    if (p.layers.length <= 1) {
      // Son katman silinmez — içi boşaltılır.
      p.layers[0]!.strokes = []
      p.images = []
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
    activeImageId.value = null
    return true
  }
  const toggleLayerVisible = (id: string): boolean => {
    const l = activePage.value.layers.find((x) => x.id === id)
    if (!l) return false
    pushHistory()
    l.visible = !l.visible
    if (!l.visible) {
      const hiddenIds = new Set([...l.strokes.map((s) => s.id), ...activePage.value.images.filter((img) => img.layerId === id).map((img) => img.id)])
      selectedIds.value = selectedIds.value.filter((sid) => !hiddenIds.has(sid))
      if (activeImageId.value && hiddenIds.has(activeImageId.value)) activeImageId.value = null
    }
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

  // Otomatik şekil tanıma: çizim bitiminde kalemi basılı tutunca primitife (çizgi/elips/kutu) kilitlenir.
  const autoShapeSnap = ref(true)
  const setAutoShapeSnap = (v: boolean) => {
    autoShapeSnap.value = v
    void persistSettings()
  }

  const activeShapeSnap = ref<{ tool: ShapeTool; points: [Point, Point] } | null>(null)
  let shapeHoldTimer: ReturnType<typeof setTimeout> | null = null

  const clearShapeHold = () => {
    if (shapeHoldTimer !== null) {
      clearTimeout(shapeHoldTimer)
      shapeHoldTimer = null
    }
  }

  const checkShapeHold = () => {
    if (!isDrawing.value || currentTool.value !== 'pen' || !autoShapeSnap.value) return
    if (points.value.length < 2) return
    const recognized = recognizeShape(points.value)
    if (recognized) {
      activeShapeSnap.value = { tool: recognized.tool, points: recognized.points }
      renderActiveStroke()
    }
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

  // Backing store'u CSS boyut x DPR yap (canvas limitlerine cap'li). Boyut değiştiyse true döner.
  const setupBackingStoreFor = (canvas: HTMLCanvasElement | null): boolean => {
    if (!canvas) return false
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (w === 0 || h === 0) return false
    const scale = capBackingScale(w, h, getDPR())
    dpr.value = scale
    const bw = Math.max(1, Math.round(w * scale))
    const bh = Math.max(1, Math.round(h * scale))
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

  // Mobil açılışta layout henüz oturmamışsa (0px) körü körüne boyama —
  // boyut gelene kadar kare kare bekle, sonra tam kurulum yap.
  const ensureCanvasReady = (tries = 90): void => {
    const base = canvasRef.value
    const over = overlayRef.value
    if (!base || !over) return
    if ((base.clientWidth === 0 || base.clientHeight === 0) && tries > 0) {
      requestAnimationFrame(() => ensureCanvasReady(tries - 1))
      return
    }
    setupCanvas()
  }

  const clearCachedRect = () => {
    cachedRect = null
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
  // --- Silgi kirli-bölge (SAYFA uzayı): tam-sayfa repaint yerine yalnız değişen bölge ---
  const brushDirty = (r: NormRect) => {
    eraseDirty = eraseDirty ? unionRect(eraseDirty, r) : { ...r }
  }
  const brushDirtyAround = (x: number, y: number, rad: number) => brushDirty(rectAround(x, y, rad))
  // Birikmiş kirli kutuyu tek KISMİ repaint'le base'e işler (rAF batched — hareket
  // başına en çok bir raster, pan yolundaki schedulePan deseninin aynısı).
  const flushEraseRepaint = () => {
    eraseRaf = 0
    const d = eraseDirty
    eraseDirty = null
    if (!d) return
    const ctx = getCtx(canvasRef.value)
    if (!ctx) return
    const pad = DIRTY_PAD_SCREEN / (effScale() || 1)
    const box = expandRect(d, pad)
    const t0 = performance.now()
    // Temizle + yalnız bu kutuya kırpıp yeniden boya (temizlenen ve boyanan bölge AYNI).
    applyView(ctx, () => {
      ctx.clearRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0)
    })
    applyView(ctx, () => {
      ctx.save()
      ctx.beginPath()
      ctx.rect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0)
      ctx.clip()
      paintPage(ctx, activePage.value, box)
      ctx.restore()
    })
    drawingPerf.eraseMs = performance.now() - t0
  }
  const scheduleEraseRepaint = () => {
    if (eraseRaf !== 0) return
    eraseRaf = requestAnimationFrame(flushEraseRepaint)
  }

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
        brushDirty(textBBoxOf(hitText))
        const [gone] = tarr.splice(idx, 1)
        if (activeTextId.value === gone!.id) activeTextId.value = null
        return true
      }
    }
    const visibleLayers = activePage.value.layers.filter((layer) => layer.visible)
    let hitStroke: { layer: Layer; stroke: Stroke } | null = null
    for (let li = visibleLayers.length - 1; li >= 0; li--) {
      const layer = visibleLayers[li]!
      for (let i = layer.strokes.length - 1; i >= 0; i--) {
        const stroke = layer.strokes[i]!
        const bb = cachedStrokeBBox(stroke)
        if (stroke.tool !== 'eraser' && bb && x >= bb.x0 && x <= bb.x1 && y >= bb.y0 && y <= bb.y1 && polylineHitsCircle(stroke.points, x, y, eraseRadius())) {
          hitStroke = { layer, stroke }
          break
        }
      }
      if (hitStroke) break
    }
    const hitImage = imageAt(x, y)
    const imgBox = hitImage && { x0: hitImage.x, y0: hitImage.y, x1: hitImage.x + hitImage.w, y1: hitImage.y + hitImage.h }
    const imageHit = imgBox && x >= imgBox.x0 && x <= imgBox.x1 && y >= imgBox.y0 && y <= imgBox.y1
    if (hitImage && (imageHit || !hitStroke)) {
      noteEraseMutation()
      const images = activePage.value.images
      images.splice(images.findIndex((img) => img.id === hitImage.id), 1)
      queueFileDeletes([hitImage.fileId])
      if (activeImageId.value === hitImage.id) activeImageId.value = null
      brushDirty(imgBox!)
      return true
    }
    if (hitStroke) {
      noteEraseMutation()
      brushDirty(cachedStrokeBBox(hitStroke.stroke)!)
      hitStroke.layer.strokes.splice(hitStroke.layer.strokes.indexOf(hitStroke.stroke), 1)
      selectedIds.value = selectedIds.value.filter((id) => id !== hitStroke!.stroke.id)
      return true
    }
    return false
  }

  // --- Kes-silgi (standart silgi): arkaplanı BOYAMAZ, çizgi verisini keser ---
  // Silgi dairesine giren segmentler history'den çıkar (koşular yeni parça olur).
  // Arkaplan (kâğıt deseni / PDF / resim) tanımsız korunur — layer mekaniği gibi
  // ama render katmanı bölmeden, veri seviyesinde. Undo mezarla geri getirir.
  const eraseRadius = (): number => Math.max(strokeWidth.value / 2, 2.5)

  const clampToPage = (p: { x: number; y: number }) => {
    const s = activePage.value.size
    return { x: Math.min(s.w, Math.max(0, p.x)), y: Math.min(s.h, Math.max(0, p.y)) }
  }

  // Süpürme bandını KIRPMA bölgesi yapar (kapsül: iki yuvarlak uç). Deseni yalnız
  // bandın içine çizmek için gerekir.
  const clipToEraseBand = (
    ctx: CanvasRenderingContext2D,
    a: { x: number; y: number },
    b: { x: number; y: number },
    radius: number,
  ) => {
    const ang = Math.atan2(b.y - a.y, b.x - a.x)
    ctx.beginPath()
    ctx.arc(a.x, a.y, radius, ang + Math.PI / 2, ang - Math.PI / 2)
    ctx.arc(b.x, b.y, radius, ang - Math.PI / 2, ang + Math.PI / 2)
    ctx.closePath()
    ctx.clip()
  }

  // Önizleme boyaması: base'e kâğıt rengi kalın çizgi/nokta (veri değişmez, repaint yok).
  const paintFastErase = (
    a: { x: number; y: number } | null,
    b: { x: number; y: number },
    radius: number,
  ) => {
    const paperHex = paperFor(activePage.value)
    if (!paperHex || radius <= 0) return
    const ctx = getCtx(canvasRef.value)
    if (!ctx) return
    // Bırakışta bu bandı kısmi repaint ile geri yükle (desen/resim/alt katman doğru dönsün).
    brushDirty(rectAround(b.x, b.y, radius + 2))
    if (a) brushDirty(rectAround(a.x, a.y, radius + 2))
    const page = activePage.value
    applyView(ctx, () => {
      ctx.save()
      // 1) Boyama SAYFAYA kırpılır: fırça yarıçapı kenarı taşır, aksi halde kâğıt
      //    dışına (letterbox) leke sürüp bırakış repaint'ine kadar orada kalırdı.
      ctx.beginPath()
      ctx.rect(0, 0, page.size.w, page.size.h)
      ctx.clip()
      // 2) Bandı kâğıt rengiyle boya (asıl önizleme).
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = paperHex
      ctx.fillStyle = paperHex
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.lineWidth = radius * 2
      ctx.beginPath()
      if (a) {
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      } else {
        ctx.arc(b.x, b.y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
      // 3) Desen/marjin varsa bandın İÇİNE onu da çiz: önizleme nihai görüntüyle
      //    aynı olmalı, yoksa sürükleme boyunca desen silinip bırakışta geri gelir
      //    ("önce boyuyor sonra kayboluyor" görüntüsü).
      const bg = paperBackground.value
      if (bg.type !== 'blank' || bg.margin) {
        ctx.save()
        if (a) {
          clipToEraseBand(ctx, a, b, radius)
        } else {
          ctx.beginPath()
          ctx.arc(b.x, b.y, radius, 0, Math.PI * 2)
          ctx.clip()
        }
        paintPaperPattern(ctx, page, bg)
        ctx.restore()
      }
      ctx.restore()
    })
  }

  // Hızlı-silgi önizlemesi (kâğıt rengi) zaten NİHAİ görüntü mü?
  // Öyleyse bırakış repaint'i gereksiz (yalnız veri kesilir). Desen/metin/resim/alt
  // katman varsa false döner (önizleme onları yanlış örter → gerçek repaint şart).
  const fastErasePreviewIsFinal = (): boolean => {
    const bg = paperBackground.value
    if (bg.type !== 'blank' || bg.margin) return false
    const page = activePage.value
    if (page.images.length > 0 || page.texts.length > 0) return false
    let visible = 0
    for (const l of page.layers) if (l.visible) visible++
    return visible <= 1
  }

  // Kesim yolu (seyreltilmiş): çemberler örtüşecek sıklıkta saklanır.
  const recordErasePath = (p: { x: number; y: number }, radius: number) => {
    const last = erasePath[erasePath.length - 1]
    if (last) {
      const dx = p.x - last.x
      const dy = p.y - last.y
      const minD = Math.max(1.5, radius * 0.5)
      if (dx * dx + dy * dy < minD * minD) return
    }
    erasePath.push({ x: p.x, y: p.y })
  }
  const splitEraseAt = (x: number, y: number, radius: number): boolean => {
    const layers = activePage.value.layers.filter((layer) => layer.visible)
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
      brushDirty(bb)
      const [gone] = tarr.splice(i, 1)
      if (activeTextId.value === gone!.id) activeTextId.value = null
    }
    const visibleLayerIds = new Set(layers.map((layer) => layer.id))
    const images = activePage.value.images
    for (let i = images.length - 1; i >= 0; i--) {
      const img = activePage.value.images[i]!
      if (!visibleLayerIds.has(img.layerId)) continue
      const nx = Math.min(Math.max(x, img.x), img.x + img.w)
      const ny = Math.min(Math.max(y, img.y), img.y + img.h)
      const dx = x - nx
      const dy = y - ny
      if (dx * dx + dy * dy > radius * radius) continue
      touch()
      brushDirty({ x0: img.x, y0: img.y, x1: img.x + img.w, y1: img.y + img.h })
      activePage.value.images.splice(i, 1)
      queueFileDeletes([img.fileId])
      if (activeImageId.value === img.id) activeImageId.value = null
    }
    const keptSel = new Set(selectedIds.value)
    let selChanged = false
    for (const layer of layers) for (let i = layer.strokes.length - 1; i >= 0; i--) {
      const s = layer.strokes[i]!
      const bb = cachedStrokeBBox(s)
      if (!bb) continue
      if (bb.x1 < x - radius || bb.x0 > x + radius || bb.y1 < y - radius || bb.y0 > y + radius) continue
      // Gerçekten değmiyorsa pahalı kopyalı kesime girme (bbox kaba filtre yetmez).
      // Yoğun sayfa-kaplayan stroke'ta yol noktası başına tam-dizi kopyasını önler.
      if (!polylineHitsCircle(s.points, x, y, radius)) continue
      const runs = splitRunsOutside(s.points, x, y, radius)
      if (runs.length === 1 && runs[0]!.length === s.points.length) continue // değmedi
      touch()
      // Daire + atılan kırıntı uzantısı + kalınlık taşması tek kutuda toplanır.
      brushDirtyAround(x, y, radius * 2 + s.width)
      layer.strokes.splice(i, 1)
      const pieces: Stroke[] = []
      // Kesim artığı eleme: 1-2pt'lik kırıntılar nokta gibi çizilip
      // "2 küçük yuvarlak" bırakıyordu. Eşik silgi yarıçapına oranlı.
      for (const run of dropTinyRuns(runs, Math.max(2, radius * 0.5))) {
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

  // Bırakışta kaydedilmiş SÜPÜRME yolunu TEK geçişte uygular: daire-başına tüm
  // stroke'ları taramak yerine stroke başına bbox BİR kez hesaplanır, yalnız
  // süpürme kutusuna girenler dairelerle sınanır → O(nokta × stroke) yerine
  // O(stroke + nokta × aday). Görsel sonuç splitEraseAt ile aynı (kümeler eşit),
  // kırıntı eleme tüm daireler uygulandıktan SONRA bir kez yapılır.
  const splitEraseSweep = (path: { x: number; y: number }[], radius: number): boolean => {
    if (path.length === 0) return false
    const layers = activePage.value.layers.filter((layer) => layer.visible)
    let touched = false
    const touch = () => {
      if (!touched) {
        touched = true
        noteEraseMutation()
      }
    }
    let sx0 = Infinity
    let sy0 = Infinity
    let sx1 = -Infinity
    let sy1 = -Infinity
    for (const p of path) {
      if (p.x - radius < sx0) sx0 = p.x - radius
      if (p.y - radius < sy0) sy0 = p.y - radius
      if (p.x + radius > sx1) sx1 = p.x + radius
      if (p.y + radius > sy1) sy1 = p.y + radius
    }
    const sweep: NormRect = { x0: sx0, y0: sy0, x1: sx1, y1: sy1 }
    const minRun = Math.max(2, radius * 0.5)
    // Daire ızgarası (hücre = çap): uzun süpürmede (100+lerce daire) stroke başına
    // yalnız kendi bbox'ının kapladığı hücrelerdeki daireler sınanır.
    const cell = Math.max(radius * 2, 1)
    const grid = new Map<string, { x: number; y: number }[]>()
    for (const c of path) {
      const key = `${Math.floor(c.x / cell)}:${Math.floor(c.y / cell)}`
      const bucket = grid.get(key)
      if (bucket) bucket.push(c)
      else grid.set(key, [c])
    }
    const visibleLayerIds = new Set(layers.map((layer) => layer.id))
    const images = activePage.value.images
    const imageIsHit = (box: NormRect): boolean => {
      const gx0 = Math.floor((box.x0 - radius) / cell)
      const gy0 = Math.floor((box.y0 - radius) / cell)
      const gx1 = Math.floor((box.x1 + radius) / cell)
      const gy1 = Math.floor((box.y1 + radius) / cell)
      const cols = gx1 - gx0 + 1
      const cellCount = cols * (gy1 - gy0 + 1)
      if (cellCount > grid.size) {
        for (const c of path) {
          const nx = Math.min(Math.max(c.x, box.x0), box.x1)
          const ny = Math.min(Math.max(c.y, box.y0), box.y1)
          if ((c.x - nx) ** 2 + (c.y - ny) ** 2 <= radius * radius) return true
        }
        return false
      }
      for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
        const bucket = grid.get(`${gx}:${gy}`)
        if (!bucket) continue
        for (const c of bucket) {
          const nx = Math.min(Math.max(c.x, box.x0), box.x1)
          const ny = Math.min(Math.max(c.y, box.y0), box.y1)
          if ((c.x - nx) ** 2 + (c.y - ny) ** 2 <= radius * radius) return true
        }
      }
      return false
    }
    for (let i = images.length - 1; i >= 0; i--) {
      const img = activePage.value.images[i]!
      if (!visibleLayerIds.has(img.layerId)) continue
      const box = { x0: img.x, y0: img.y, x1: img.x + img.w, y1: img.y + img.h }
      if (!rectsOverlap(box, sweep)) continue
      if (!imageIsHit(box)) continue
      touch()
      brushDirty(box)
      activePage.value.images.splice(i, 1)
      queueFileDeletes([img.fileId])
      if (activeImageId.value === img.id) activeImageId.value = null
    }
    // Metin kutuları parçalanmaz: daire değerse tümden gider.
    const tarr = activePage.value.texts
    for (let i = tarr.length - 1; i >= 0; i--) {
      const t = tarr[i]!
      if (!t.text) continue
      const tbb = textBBoxOf(t)
      if (!rectsOverlap(tbb, sweep)) continue
      let hit = false
      for (const c of path) {
        const nx = Math.min(Math.max(c.x, tbb.x0), tbb.x1)
        const ny = Math.min(Math.max(c.y, tbb.y0), tbb.y1)
        const dx = c.x - nx
        const dy = c.y - ny
        if (dx * dx + dy * dy <= radius * radius) {
          hit = true
          break
        }
      }
      if (!hit) continue
      touch()
      brushDirty(tbb)
      const [gone] = tarr.splice(i, 1)
      if (activeTextId.value === gone!.id) activeTextId.value = null
    }
    const keptSel = new Set(selectedIds.value)
    let selChanged = false
    for (const layer of layers) for (let i = layer.strokes.length - 1; i >= 0; i--) {
      const s = layer.strokes[i]!
      const bb = cachedStrokeBBox(s)
      if (!bb) continue
      if (!rectsOverlap(bb, sweep)) continue
      let runs: Point[][] = [s.points]
      let hitAny = false
      const gx0 = Math.floor(bb.x0 / cell)
      const gx1 = Math.floor(bb.x1 / cell)
      const gy0 = Math.floor(bb.y0 / cell)
      const gy1 = Math.floor(bb.y1 / cell)
      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          const bucket = grid.get(`${gx}:${gy}`)
          if (!bucket) continue
          for (const c of bucket) {
            const cRect: NormRect = {
              x0: c.x - radius,
              y0: c.y - radius,
              x1: c.x + radius,
              y1: c.y + radius,
            }
            if (!rectsOverlap(bb, cRect)) continue
            let hitCircle = false
            const next: Point[][] = []
            for (const run of runs) {
              if (polylineHitsCircle(run, c.x, c.y, radius)) {
                hitCircle = true
                for (const piece of splitRunsOutside(run, c.x, c.y, radius)) next.push(piece)
              } else {
                next.push(run)
              }
            }
            if (!hitCircle) continue
            hitAny = true
            runs = next
            // Daire + atılan kırıntı uzantısı + kalınlık taşması tek kutuda toplanır.
            brushDirtyAround(c.x, c.y, radius * 2 + s.width)
          }
        }
      }
      if (!hitAny) continue
      touch()
      layer.strokes.splice(i, 1)
      const pieces: Stroke[] = []
      for (const run of dropTinyRuns(runs, minRun)) {
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
    // Bayat hızlı-silgi bayrağı kalmasın (yalnız aktif silgi sürüklemesinde true).
    fastErase = false
    // Vuruş-silgi nokta toplamaz: dokunduğu anda söker.
    // (Hızlı önizleme YOK: süpürme başına söküm semantiği korunsun.)
    if (currentTool.value === 'eraser' && eraserMode.value === 'stroke') {
      isDrawing.value = true
      eraseSession += 1
      const { x, y } = getPos(e)
      if (eraseStrokeAt(x, y)) {
        recountActive()
        scheduleEraseRepaint()
        scheduleSave()
      }
      return true
    }
    // Kes-silgi nokta toplamaz, boyamaz: dairede kalan segmenti history'den keser.
    // Arkaplan (desen/PDF) hiçbir katmanda ezilmez.
    if (currentTool.value === 'eraser') {
      isDrawing.value = true
      eraseSession += 1
      const p0 = clampToPage(getPos(e))
      const r = eraseRadius()
      if (paperFor(activePage.value) !== null) {
        fastErase = true
        erasePath = [p0]
        eraseFastLast = p0
        paintFastErase(null, p0, r)
        return true
      }
      if (splitEraseAt(p0.x, p0.y, r)) {
        recountActive()
        scheduleEraseRepaint()
        scheduleSave()
      }
      return true
    }
    isDrawing.value = true
    clearShapeHold()
    activeShapeSnap.value = null

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
    // İlk vuruş tohumu: donanımın biriktirdiği ara noktaları da al. Hızlı kalem
    // girişinde tek nokta, çizginin başını yutuyordu. Basınç her noktanın kendi
    // event'inden; liste boşsa/tekse davranış birebir aynı (mouse'ta no-op).
    const seedPts: { x: number; y: number; pressure: number }[] = [
      { x: cx, y: cy, pressure: readPressure(e) },
    ]
    if (typeof e.getCoalescedEvents === 'function') {
      const minD = MIN_DIST_SCREEN / (effScale() || 1)
      for (const ev of e.getCoalescedEvents()) {
        if (ev === e) continue
        const g = getPos(ev as PointerEvent)
        if (g.x < -m || g.y < -m || g.x > size.w + m || g.y > size.h + m) continue
        const qx = Math.min(size.w, Math.max(0, g.x))
        const qy = Math.min(size.h, Math.max(0, g.y))
        const last = seedPts[seedPts.length - 1]!
        const dx = qx - last.x
        const dy = qy - last.y
        if (dx * dx + dy * dy < minD * minD) continue
        seedPts.push({ x: qx, y: qy, pressure: readPressure(ev as PointerEvent) })
      }
    }
    const lastSeed = seedPts[seedPts.length - 1]!
    lastPressure = lastSeed.pressure
    smoothPt = { x: lastSeed.x, y: lastSeed.y }
    points.value = seedPts
    bb = { x0: cx, y0: cy, x1: cx, y1: cy }
    for (const s of seedPts) {
      if (s.x < bb.x0) bb.x0 = s.x
      else if (s.x > bb.x1) bb.x1 = s.x
      if (s.y < bb.y0) bb.y0 = s.y
      else if (s.y > bb.y1) bb.y1 = s.y
    }
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
        scheduleEraseRepaint()
        scheduleSave()
      }
      return
    }

    // Kes-silgi: dairede kalanı kes, tur başına tek boya (arkaplan ezilmez).
    if (currentTool.value === 'eraser') {
      const r = eraseRadius()
      if (fastErase) {
        // Frame başına TEK önizleme çizgisi: ara olaylar tek korda birleşir.
        // Kalın fırçada N kez kalın raster yerine 1 kez → fill-rate kazancı.
        let last = eraseFastLast
        for (const ev of coalescedOf(e)) {
          const p = clampToPage(getPos(ev))
          recordErasePath(p, r)
          last = p
        }
        if (last && last !== eraseFastLast) paintFastErase(eraseFastLast, last, r)
        eraseFastLast = last
        return
      }
      let hit = false
      for (const ev of coalescedOf(e)) {
        const p = getPos(ev)
        if (splitEraseAt(p.x, p.y, r)) hit = true
      }
      if (hit) {
        recountActive()
        scheduleEraseRepaint()
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
    if (autoShapeSnap.value && currentTool.value === 'pen') {
      clearShapeHold()
      if (activeShapeSnap.value) {
        if (activeShapeSnap.value.tool === 'line' || activeShapeSnap.value.tool === 'arrow') {
          activeShapeSnap.value.points[1] = { x, y, pressure: pressureVal }
        }
      } else if (pts.length >= 3) {
        shapeHoldTimer = setTimeout(checkShapeHold, 420)
      }
    }
  }

  // ✅ Bitti — stroke'u geçmişe kaydet ve base katmanına bir kez işle (overlay temizlenir).
  // Silgi nokta toplamaz: kes/vuruş oturumlarında points boştur, kayıt oluşmaz.
  const stopDrawing = () => {
    clearShapeHold()
    // Hızlı silgi: bırakışta gerçek kesimi yol boyunca uygula + tek tam repaint.
    if (fastErase) {
      fastErase = false
      const radius = eraseRadius()
      // Karar kesimDEN ÖNCE alınır: sweep bir metin kutusunu sökerse (metinler
      // parçalanmaz, tümden gider) kontrol "nihai" der ama önizleme bandı yalnız
      // süpürülen yeri boyar → kutunun bandın dışında kalan kısmı hayalet kalırdı.
      const previewFinal = fastErasePreviewIsFinal()
      const tCut = performance.now()
      const hit = splitEraseSweep(erasePath, radius)
      drawingPerf.cutMs = performance.now() - tCut
      erasePath = []
      eraseFastLast = null
      isDrawing.value = false
      points.value = []
      bb = null
      recountActive()
      // Önizleme zaten nihai görüntüyse repaint'i tamamen atla (e = 0);
      // aksi halde yalnız süpürülen/kirli bölgeyi geri boya (kirli kutu birikti).
      if (previewFinal) {
        eraseDirty = null
        drawingPerf.eraseMs = 0
      } else {
        flushEraseRepaint()
      }
      clearOverlay()
      if (hit) scheduleSave()
      return
    }
    if (isDrawing.value && points.value.length > 0) {
      const snapped = activeShapeSnap.value
      // Şekiller uç-noktayla saklanır (ara noktalar sürükleme artığıdır, export'u şişirmesin).
      const shapeEnds = snapped
        ? snapped.points
        : isShapeTool(currentTool.value)
          ? shapeEndpoints(points.value)
          : null
      const strokeTool = snapped ? snapped.tool : currentTool.value
      const stroke: Stroke = {
        id: newStrokeId(),
        tool: strokeTool,
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
      activeShapeSnap.value = null
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
          applyView(ctx, () => paintStroke(ctx, stroke, paperHex, pressureSensitivity.value))
        }
      }
      scheduleSave()
    }
    isDrawing.value = false
    points.value = []
    activeShapeSnap.value = null
    clearOverlay()
    bb = null
  }

  // Overlay'i temizle — fullscreen DEĞİL, aktif çizginin kirli kutusu + pay (sayfa uzayında).
  // Pay: config/engine (DIRTY_PAD_SCREEN).
  const clearOverlay = () => {
    const ctx = getCtx(overlayRef.value)
    if (!ctx) return
    if (!bb || activeShapeSnap.value) {
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
    // Bekleyen kısmi repaint tam boyamayla gereksiz; iptal + kirli kutuyu sıfırla.
    if (eraseRaf !== 0) {
      cancelAnimationFrame(eraseRaf)
      eraseRaf = 0
    }
    eraseDirty = null
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
    } else if (bg.type === 'isometric') {
      ctx.lineWidth = 0.5
      for (const line of isometricLines(w, h, bg.spacing)) {
        ctx.beginPath()
        ctx.moveTo(line.x1, line.y1)
        ctx.lineTo(line.x2, line.y2)
        ctx.stroke()
      }
    } else if (bg.type === 'cornell') {
      const cl = cornellLayout(w, h, bg.spacing)
      if (cl) {
        // Ana ayırıcılar (daha belirgin)
        ctx.lineWidth = 1.2
        // Üst başlık çizgisi
        ctx.beginPath()
        ctx.moveTo(0, cl.headerY)
        ctx.lineTo(w, cl.headerY)
        ctx.stroke()
        // Dikey cue sütun çizgisi
        ctx.beginPath()
        ctx.moveTo(cl.cueX, cl.headerY)
        ctx.lineTo(cl.cueX, cl.summaryY)
        ctx.stroke()
        // Alt özet çizgisi
        ctx.beginPath()
        ctx.moveTo(0, cl.summaryY)
        ctx.lineTo(w, cl.summaryY)
        ctx.stroke()

        // Not satırları (ince)
        ctx.lineWidth = 0.6
        for (const r of cl.ruledLines) {
          ctx.beginPath()
          ctx.moveTo(r.x1, r.y)
          ctx.lineTo(r.x2, r.y)
          ctx.stroke()
        }
      }
    } else if (bg.type === 'planner') {
      const pl = plannerLayout(w, h, bg.spacing)
      if (pl) {
        // Üst başlık ayrımı
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(0, pl.headerY)
        ctx.lineTo(w, pl.headerY)
        ctx.stroke()

        // Sağ yan sütun varsa
        if (pl.sideColX !== null) {
          ctx.beginPath()
          ctx.moveTo(pl.sideColX, pl.headerY)
          ctx.lineTo(pl.sideColX, h)
          ctx.stroke()
        }

        // Satırlar ve sol kutucuklar
        for (let i = 0; i < pl.ruledLines.length; i++) {
          const y = pl.ruledLines[i]
          const boxX = pl.checkboxXs[i]
          if (y === undefined || boxX === undefined) continue
          ctx.lineWidth = 0.6
          ctx.beginPath()
          ctx.moveTo(0, y)
          ctx.lineTo(w, y)
          ctx.stroke()

          // Checkbox kutusu (kare, kenar uzunluğu 8pt, satırın üstünde)
          const boxSize = Math.min(10, Math.max(6, Math.round(bg.spacing * 0.45)))
          const boxY = y - boxSize - 3
          if (boxY > pl.headerY) {
            ctx.lineWidth = 0.9
            ctx.strokeRect(boxX, boxY, boxSize, boxSize)
          }
        }
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
  const paintTexts = (ctx: CanvasRenderingContext2D, page: Page, dirty: NormRect | null = null) => {
    const items = page.texts
    if (!items || items.length === 0) return
    ctx.save()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    for (const t of items) {
      if (!t.text) continue
      if (t.id === activeTextId.value) continue
      if (dirty && !rectsOverlap(textBBoxOf(t), dirty)) continue
      ctx.fillStyle = t.color
      ctx.font = `${t.size}px sans-serif`
      const lh = t.size * 1.25
      const lines = wrapTextToWidth(t.text, t.w ?? 0, t.size)
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i]!, t.x, t.y + i * lh)
      }
    }
    ctx.restore()
  }

  // Resimler sahip oldukları katmanda, o katmanın mürekkebinden önce çizilir.
  const paintImages = (ctx: CanvasRenderingContext2D, page: Page, layer: Layer, dirty: NormRect | null) => {
    for (const img of page.images) {
      if (img.layerId !== layer.id) continue
      if (dirty && !rectsOverlap({ x0: img.x, y0: img.y, x1: img.x + img.w, y1: img.y + img.h }, dirty)) continue
      const bmp = imgBitmaps.get(img.fileId)
      if (!bmp) continue
      ctx.drawImage(bmp, img.x, img.y, img.w, img.h)
    }
  }

  // dirty: verilirse yalnız bu kutuyla kesişen stroke'lar boyanır (kısmi repaint).
  // Kâğıt/desen/arkaplan/resim tam çizilir; çağıran zaten clip'ler.
  const paintPage = (ctx: CanvasRenderingContext2D, page: Page, dirty: NormRect | null = null) => {
    const paperHex = paperFor(page)
    if (paperHex) {
      ctx.fillStyle = paperHex
      ctx.fillRect(0, 0, page.size.w, page.size.h)
      paintPaperPattern(ctx, page, paperBackground.value)
    }
    const bg = bgCanvases.get(page.id)
    if (bg) ctx.drawImage(bg, 0, 0, page.size.w, page.size.h)
    // Katmanlar sırayla (0 en alt); görseller sahip oldukları katmanı izler.
    for (const layer of page.layers) {
      if (!layer.visible) continue
      paintImages(ctx, page, layer, dirty)
      for (const s of layer.strokes) {
        if (dirty) {
          // strokeBBox yalnız width/2 pay bırakır; vurgulayıcı w*2.5 ile çizilir
          // (bleed ~0.75*w). Komşu kalın vuruş kesik görünmesin diye marj ekle.
          const b = cachedStrokeBBox(s)
          if (!b || !rectsOverlap(expandRect(b, DIRTY_STROKE_MARGIN), dirty)) continue
          // Sayfa-kaplayan dev stroke'u her frame baştan tessellate etme: yalnız kirli
          // kutuya yakın nokta koşularını çiz (şekiller uç-noktalı, onlar tam kalır).
          if (!isShapeTool(s.tool)) {
            const runs = subRunsInRect(s.points, dirty, DIRTY_STROKE_MARGIN)
            if (runs.length === 0) continue
            // Genişlik TÜM noktalardan hesaplanır (basınç ortalaması) — koşuya bölününce
            // değişmesin diye tam genişliği geçir, hassasiyeti 0 ver.
            const fullW =
              s.tool === 'eraser'
                ? s.width
                : effectiveWidth(s.points, s.width, pressureSensitivity.value)
            for (const run of runs) {
              paintStroke(ctx, { ...s, width: fullW, points: run }, paperHex, 0)
            }
            continue
          }
        }
        paintStroke(ctx, s, paperHex, pressureSensitivity.value)
      }
    }
    paintTexts(ctx, page, dirty)
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
    // Dev sayfa + yüksek ölçekte canvas limiti: boş çıktı yerine cap'li ölçek.
    scale = capBackingScale(w, h, scale)
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
      const strokeToPaint: Stroke = activeShapeSnap.value
        ? {
            id: 'preview-snap',
            tool: activeShapeSnap.value.tool,
            color: color.value,
            width: strokeWidth.value,
            dash: strokeDash.value,
            opacity: strokeOpacity.value,
            points: activeShapeSnap.value.points,
          }
        : {
            id: 'preview-active',
            tool: currentTool.value,
            color: color.value,
            width: strokeWidth.value,
            dash: strokeDash.value,
            opacity: strokeOpacity.value,
            points: points.value,
          }
      applyView(ctx, () => {
        paintStroke(
          ctx,
          strokeToPaint,
          paperHex,
          pressureSensitivity.value,
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

  // PDF kalite politikası: config/engine (PDF_RENDER_*, RERENDER_DELAY).
  // Açık PDF'in bytes'ları (yeniden render için bellekte; kapatınca silinir).
  let pdfBytesCache: Uint8Array | null = null
  const pendingPdfDeletes = new Set<string>()
  // Sayfa id → bitmap'in render ölçeği (pt→bitmap px). İhtiyaç hesabının girdisi.
  const pdfRenderScales = new Map<string, number>()

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
      const id = `pdf-${crypto.randomUUID()}`
      // Önce dosyayı persist et: başarısızsa mevcut sahne korunur.
      await storage.setFile({
        id,
        name: file.name,
        size: file.size,
        addedAt: Date.now(),
        pageCount: rendered.length,
        bytes: stored,
      })
      if (pdfId.value && pdfId.value !== id) pendingPdfDeletes.add(pdfId.value)
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
    // Kaydırmalı modda boya-pan YOKTUR (gezinti native scroll'undur);
    // sızan eski pan canlı sayfayı bloktan kaydırırdı — sigorta olarak sıfırla.
    if (scrollLive) {
      viewPanX = 0
      viewPanY = 0
    }
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
        paintPatternVector(doc, page, paperBackground.value, bgCanvases.has(page.id))
      }
      const bg = bgCanvases.get(page.id)
      if (bg) doc.addImage(bg.toDataURL('image/jpeg', JPEG_QUALITY), 'JPEG', 0, 0, w, h)
      for (const img of page.images) {
        const bmp = imgBitmaps.get(img.fileId)
        if (bmp) doc.addImage(bmp.toDataURL('image/png'), 'PNG', img.x, img.y, img.w, img.h)
      }
      paintStrokesVector(doc, GState, page, paperHex, pressureSensitivity.value)
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
        v: 6,
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
        uiScale: uiScale.value,
        pageStripOpen: pageStripOpen.value,
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
      await setCalemHandle(handle as unknown as CalemFileHandle)
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      lastSavedAt.value = fmtTime(Date.now())
      return 'saved'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      throw e
    }
  }

  // --- .calem hızlı kayıt (Ctrl+S): açık dosyanın handle'ı IDB'de saklanır,
  // varsa picker sormadan direkt yazılır. Handle'lar structured-clone ile IDB'ye girer.
  const CALEM_HANDLE_KEY = 'calem-file-handle'
  const calemHandle = ref<CalemFileHandle | null>(null)

  const setCalemHandle = async (h: CalemFileHandle | null) => {
    calemHandle.value = h
    try {
      await storage.setKey(CALEM_HANDLE_KEY, h)
    } catch {
      // Gizli mod vb. — handle yalnızca oturumluk yaşar, sorun değil.
    }
  }

  const loadCalemHandle = async () => {
    try {
      const h = await storage.getKey<CalemFileHandle>(CALEM_HANDLE_KEY)
      if (h && typeof h.createWritable === 'function') calemHandle.value = h
    } catch {
      // Yoksay — ilk kayıtta picker açılır.
    }
  }

  // Ctrl+S + "Calem'i kaydet": kayıtlı dosya varsa üstüne yazar,
  // yoksa konum sorar (Save As), API yoksa klasik indirme.
  const quickSaveCalem = async (): Promise<{ pages: number } | { error: string } | { cancelled: true }> => {
    if (pdfBusy.value || imgBusy.value) return { error: 'işlem sürüyor' }
    pdfBusy.value = true
    try {
      const built = await buildCalemJSON()
      if ('error' in built) return built
      const blob = new Blob([built.json], { type: 'application/json' })
      if (calemHandle.value) {
        if (await writeCalemToHandle(calemHandle.value, blob)) {
          lastSavedAt.value = fmtTime(Date.now())
          return { pages: pages.value.length }
        }
        // Handle ölmüş (taşınmış/silinmiş dosya, reddedilen izin) — unut, picker'a düş.
        await setCalemHandle(null)
      }
      const how = await saveCalemBlob(blob, calemFileName())
      if (how === 'saved') return { pages: pages.value.length }
      if (how === 'cancelled') return { cancelled: true }
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = calemFileName()
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(a.href), 5000)
      return { pages: pages.value.length }
    } catch (e) {
      console.error('[calem] hızlı kayıt hatası:', e)
      return { error: `yazılamadı (${e instanceof Error ? e.message : 'bilinmiyor'})` }
    } finally {
      pdfBusy.value = false
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

  // .xopp (Xournal++) dışa aktarır: sayfaları gzip-XML vektör olarak kaydeder.
  const exportXopp = async (): Promise<{ pages: number } | { error: string }> => {
    if (pdfBusy.value || imgBusy.value) return { error: 'işlem sürüyor' }
    pdfBusy.value = true
    try {
      const u8 = await exportXoppBytes(pages.value, paperFor(activePage.value) ?? '#ffffff')
      const fileName = xoppFileName()
      const blob = new Blob([u8.buffer as ArrayBuffer], { type: 'application/x-xopp' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = fileName
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(a.href), 5000)
      return { pages: pages.value.length }
    } catch (e) {
      console.error('[calem] xopp export hatası:', e)
      return { error: `yazılamadı (${e instanceof Error ? e.message : 'bilinmiyor'})` }
    } finally {
      pdfBusy.value = false
    }
  }

  // .xopp açar: sayfaları ve katmanları Xournal++'tan yükler.
  const importXopp = async (file: File): Promise<{ pages: number } | { error: string }> => {
    if (pdfBusy.value || imgBusy.value) return { error: 'işlem sürüyor' }
    pdfBusy.value = true
    try {
      const bytes = await file.arrayBuffer()
      const { pages: importedPages, paperHex } = await importXoppBytes(bytes)
      if (importedPages.length === 0) return { error: 'sayfa yok' }
      if (paperHex && paperHex !== '#ffffff') {
        paper.value = paperHex
      }
      if (pdfId.value) pendingPdfDeletes.add(pdfId.value)
      deleteImageFilesOf(pages.value)
      imgBitmaps.clear()
      bgCanvases.clear()
      pdfRenderScales.clear()
      pdfBytesCache = null
      pdfId.value = null
      pdfName.value = ''
      pages.value = importedPages
      activePageIndex.value = 0
      clearHistory()
      selectedIds.value = []
      activeTextId.value = null
      activeImageId.value = null
      recountActive()
      repaintBase()
      renderActiveStroke()
      scheduleSave()
      return { pages: importedPages.length }
    } catch (e) {
      console.error('[calem] xopp import hatası:', e)
      return { error: `okunamadı (${e instanceof Error ? e.message : 'bilinmiyor'})` }
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
        .map((p) => sanitizePageFromRaw(p, fallback, newPageId))
        .filter((p): p is Page => p !== null)
      if (clean.length === 0) return { error: 'sayfa yok' }
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
      // Gömülü dosyalar yazılmadan ayarları değiştirip yarım içe aktarma bırakma.
      if (r.settings && typeof r.settings === 'object') {
        await importSettingsJSON(JSON.stringify(r.settings))
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
      deleteImageFilesOf(pages.value, collectReferencedImageFileIds(clean, [], []))
      if (pdfId.value) pendingPdfDeletes.add(pdfId.value)
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
    if (pdfId.value) pendingPdfDeletes.add(pdfId.value)
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
  let saveRevision = 0
  // IDB'ye henüz flush'lanmamış iş var mı (kapatma onayının kapısı).
  const pendingSave = ref(false)
  const saveError = ref(false)

  const fmtTime = (t: number) =>
    new Date(t).toLocaleTimeString(locale.value === 'tr' ? 'tr-TR' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    })

  const persistNow = async (): Promise<void> => {
    const startedRevision = saveRevision
    try {
      const now = Date.now()
      const doc = buildPersistedDoc({
        pages: pages.value,
        widths: widths.value,
        activePageIndex: activePageIndex.value,
        pdfId: pdfId.value,
        pdfName: pdfName.value,
      })
      await storage.setDoc(doc)
      lastSavedAt.value = fmtTime(now)
      if (isLatestSave(startedRevision, saveRevision)) {
        pendingSave.value = false
        saveError.value = false
        for (const id of takeObsoletePdfIds(pendingPdfDeletes, pdfId.value)) {
          void storage.deleteFile(id).catch(() => {})
        }
      }
    } catch {
      // Save stays pending so close warns and the file menu can report the failure.
      saveError.value = true
    }
  }

  // Thumbnail serit sürümü: her içerik mutasyonunda artar (component debounce'lu okur).
  const thumbTick = ref(0)

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveRevision += 1
    pendingSave.value = true
    saveTimer = setTimeout(() => {
      saveTimer = undefined
      void persistNow()
    }, SAVE_DELAY)
    // Tüm içerik mutasyonları buradan geçer → thumbnail seridi kirlenir.
    // Görünüm-only op'lar (zoom/pan) buraya uğramaz, serit boşuna yanmaz.
    thumbTick.value += 1
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
    const summary = summarizePersistedDoc(doc, fmtTime)
    savedSession.value = summary
    return summary !== null
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
    // Kayıtlı .calem dosya handle'ı (Ctrl+S direkt yazsın diye).
    await loadCalemHandle()
    if (!doc || typeof doc.v !== 'number') return false

    const viewFallback = {
      w: canvasRef.value?.clientWidth || FALLBACK_VIEWPORT.w,
      h: canvasRef.value?.clientHeight || FALLBACK_VIEWPORT.h,
    }
    const res = deserializePersistedDoc({ doc, viewFallback, newPageId })
    if (!res) return false

    if (res.widths) {
      for (const [k, v] of Object.entries(res.widths)) {
        if (k in widths.value) (widths.value as Record<string, number>)[k] = v
      }
    }

    pages.value = res.pages
    savedSession.value = null
    clearHistory()
    selectedIds.value = []
    activeTextId.value = null
    activeImageId.value = null
    activePageIndex.value = res.activePageIndex
    layoutView()
    // PDF kaydı varsa arkaplanları bytes'tan yeniden üret (yoksa mürekkep tek başına durur).
    if (res.pdfId) {
      pdfId.value = res.pdfId
      pdfName.value = res.pdfName
      await restorePdfBackgrounds(res.pdfId)
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
      images: src.images.map((m) => ({ ...snapshotImage(m), id: newStrokeId(), layerId: layerId.get(m.layerId) ?? layers[0]!.id })),
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
    // Boyut yoksa boyama (0px fit matematiğini bozar); bir sonraki resize düzeltir.
    const c = canvasRef.value
    if (c && (c.clientWidth === 0 || c.clientHeight === 0)) return
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
    uiScale,
    setUiScale,
    pageStripOpen,
    setPageStripOpen,
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
    zoomFactor,
    setScrollLive,
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
    autoShapeSnap,
    setAutoShapeSnap,
    activeShapeSnap,
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
    visibleImages,
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
    ensureCanvasReady,
    clearCachedRect,
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
    scheduleSave,
    pendingSave,
    saveError,
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
    exportXopp,
    importXopp,
    quickSaveCalem,
    setCalemHandle,
    importCalem,
    resizeCanvas,
  }
})
