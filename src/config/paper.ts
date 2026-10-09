import type { PaperBackground } from '../lib/paper'

// Kâğıt/sayfa varsayılanları (punto). Ayarlar UI'ı buradan beslenir.

// A4 punto — boş sayfaların varsayılan boyutu.
export const A4 = { w: 595, h: 842 }

// Desen aralığı kelepçesi (pt) — geometri + slider buradan beslenir.
export const PAPER_SPACING_MIN = 12
export const PAPER_SPACING_MAX = 48

// Kâğıt renk temaları.
export const PAPER_THEMES = {
  gece: '#111827',
  siyah: '#000000',
  kagit: '#f5f1e8',
} as const

// Sayfa biçimleri (punto, dikey). Yatayda en-boy yer değiştirir.
export const PAGE_FORMATS = {
  A4: { w: 595, h: 842 },
  A3: { w: 842, h: 1191 },
  A5: { w: 420, h: 595 },
  Letter: { w: 612, h: 792 },
} as const
export type PaperTheme = keyof typeof PAPER_THEMES
export type PageFormat = keyof typeof PAGE_FORMATS | 'custom'
export type PageOrientation = 'portrait' | 'landscape'

export const DEFAULT_PAPER_BACKGROUND: PaperBackground = {
  type: 'blank',
  spacing: 28,
  lineColor: '#334155',
  margin: false,
  marginColor: '#ef4444',
}
