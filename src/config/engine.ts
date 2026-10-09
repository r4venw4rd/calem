// Motor sabitleri: görünüm, render, zamanlama, limitler.
// Kullanıcı ayarı DEĞİLDIR — davranış değişikliği burada yapılır, testler kilitler.

/** View zoom kelepçesi (çarpan). */
export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 8

/** Undo/redo derinliği (snapshot adedi). */
export const HISTORY_CAP = 25

/** Resim import bitmap cap'i (px, oran korunur). */
export const IMAGE_MAX_DIM = 1600

/** Çizgi desimasyonu: daha yakın noktalar atılır (ekran-px). */
export const MIN_DIST_SCREEN = 1.5

/** Overlay kirli-kutu payı (ekran-px → sayfa uzayına çevrilir). */
export const DIRTY_PAD_SCREEN = 36

/** Sayfa raster export ölçeği (~144dpi). */
export const EXPORT_SCALE = 2

/** PDF arkaplan bitmap ölçekleri; çok sayfada düşük olan. */
export const PDF_RENDER_BASE = 3
export const PDF_RENDER_MANY = 1.5
export const PDF_RENDER_MAX = 4

/** 30 sayfadan fazlası düşük çözünürlükle açılır. */
export const PDF_MANY_THRESHOLD = 30

/** Zoom-sonu PDF tazeleme beklemesi (ms). */
export const RERENDER_DELAY = 600

/** Autosave beklemesi (ms). */
export const SAVE_DELAY = 800

/** Backing-store DPR cap'i. */
export const DPR_CAP = 2

/** Özel sayfa boyutu kelepçesi (pt). */
export const PAGE_MIN = 100
export const PAGE_MAX = 3000

/** Canvas ölçülemezken varsayılan boyut (px). */
export const FALLBACK_VIEWPORT = { w: 800, h: 600 } as const

/** Base64 parça boyutu (yığın taşmasın). */
export const B64_CHUNK = 0x8000

/** PDF arkaplan JPEG kalitesi. */
export const JPEG_QUALITY = 0.9
