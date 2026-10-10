// Belge model tipleri: sayfa-uzayı vektör + katman. Saf tip + sabit, reaktivite yok.
// Çizgiler sayfa punto'sunda saklanır: ekrandan, DPR'dan ve resize'dan bağımsız.

import type { PaperBackground } from '../lib/paper'
import type { Locale } from '../config/locale'
import type { PageFormat, PageOrientation } from '../config/paper'

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
  /** Metin alanı genişliği (pt). Varsa satırlar bu genişliğe sarılır (Xournal metin kutusu gibi). */
  w?: number
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
// v1: kâğıt rengi + biçim; v2: + kâğıt deseni; v3: + silgi modu; v4: + toolbar; v5: + locale + el silginin sağında; v6: + silgi vurgunun solunda.
export type UiTheme = 'koyu' | 'acik'
export type EraserMode = 'standard' | 'stroke'
export interface AppSettings {
  v: 1 | 2 | 3 | 4 | 5 | 6
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
  uiScale?: number
  pageStripOpen?: boolean
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
