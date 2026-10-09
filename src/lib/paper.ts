// Kâğıt deseni saf helper'ları (Faz 1).
// Bilerek render/Pinia bağımsız: test edilebilir, sayfa-uzayında (pt) çalışır.
// Boyama `drawing.ts paintPage()` içinde yapılacak; burası sadece geometri + doğrulama.
// Varsayılan değer config/paper'dadır; kullananlar oradan alır.
import { DEFAULT_PAPER_BACKGROUND } from '../config/paper'

export { DEFAULT_PAPER_BACKGROUND }

export type PaperBackgroundType = 'blank' | 'ruled' | 'graph' | 'dotted' | 'staff'

export interface PaperBackground {
  type: PaperBackgroundType
  /** çizgi/nokta aralığı (pt). */
  spacing: number
  /** desen çizgi/nokta rengi (hex). */
  lineColor: string
  /** kenar marjin çizgisi var mı. */
  margin: boolean
  marginColor: string
}

export const PAPER_SPACING_MIN = 12
export const PAPER_SPACING_MAX = 48

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export const isPaperBackgroundType = (v: unknown): v is PaperBackgroundType =>
  v === 'blank' || v === 'ruled' || v === 'graph' || v === 'dotted' || v === 'staff'

const clampSpacing = (n: unknown): number => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT_PAPER_BACKGROUND.spacing
  return Math.min(PAPER_SPACING_MAX, Math.max(PAPER_SPACING_MIN, Math.round(n)))
}

const cleanHex = (v: unknown, fallback: string): string =>
  typeof v === 'string' && HEX_RE.test(v) ? v : fallback

// Bozuk kayda karşı alan alan doğrular; her zaman geçerli bir background döner.
export const cleanPaperBackground = (input: unknown): PaperBackground => {
  if (!input || typeof input !== 'object') return { ...DEFAULT_PAPER_BACKGROUND }
  const r = input as Record<string, unknown>
  return {
    type: isPaperBackgroundType(r.type) ? r.type : 'blank',
    spacing: clampSpacing(r.spacing),
    lineColor: cleanHex(r.lineColor, DEFAULT_PAPER_BACKGROUND.lineColor),
    margin: r.margin === true,
    marginColor: cleanHex(r.marginColor, DEFAULT_PAPER_BACKGROUND.marginColor),
  }
}

// --- Saf geometri (sayfa-uzayı, pt) ---

// Yatay çizgiler (ruled/graph): üstten alta spacing adımlarla.
export const ruledLineYs = (pageH: number, spacing: number): number[] => {
  const s = clampSpacing(spacing)
  if (!(pageH > 0)) return []
  const out: number[] = []
  for (let y = s; y < pageH; y += s) out.push(y)
  return out
}

// Dikey çizgiler (graph): soldan sağa.
export const graphLineXs = (pageW: number, spacing: number): number[] => {
  const s = clampSpacing(spacing)
  if (!(pageW > 0)) return []
  const out: number[] = []
  for (let x = s; x < pageW; x += s) out.push(x)
  return out
}

// Nokta grid (dotted).
export const dottedPoints = (
  pageW: number,
  pageH: number,
  spacing: number,
): { x: number; y: number }[] => {
  const s = clampSpacing(spacing)
  if (!(pageW > 0) || !(pageH > 0)) return []
  const out: { x: number; y: number }[] = []
  for (let y = s; y < pageH; y += s) {
    for (let x = s; x < pageW; x += s) out.push({ x, y })
  }
  return out
}

// Porte grupları (staff): 5'li çizgi demetleri, demet arası 4*spacing boşluk.
export const staffLineYs = (pageH: number, spacing: number): number[][] => {
  const s = clampSpacing(spacing)
  if (!(pageH > 0)) return []
  const groups: number[][] = []
  const lineGap = Math.max(6, Math.round(s / 3))
  const groupGap = lineGap * 4 + s
  let top = s
  while (top + lineGap * 4 < pageH) {
    groups.push([0, 1, 2, 3, 4].map((i) => top + i * lineGap))
    top += lineGap * 4 + groupGap
  }
  return groups
}

// Marjin çizgisi x konumu (klasik: 72pt). Sayfa darsa çizilmez.
export const marginLineX = (pageW: number): number | null => {
  if (!(pageW > 144)) return null
  return 72
}
