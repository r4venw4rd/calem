// Kâğıt deseni saf helper'ları (Faz 1).
// Bilerek render/Pinia bağımsız: test edilebilir, sayfa-uzayında (pt) çalışır.
// Boyama `drawing.ts paintPage()` içinde yapılacak; burası sadece geometri + doğrulama.
// Sabitler config/paper'dadır (PAPER_SPACING_*, DEFAULT_PAPER_BACKGROUND).
import { DEFAULT_PAPER_BACKGROUND, PAPER_SPACING_MAX, PAPER_SPACING_MIN } from '../config/paper'

export { DEFAULT_PAPER_BACKGROUND, PAPER_SPACING_MAX, PAPER_SPACING_MIN }

export type PaperBackgroundType =
  | 'blank'
  | 'ruled'
  | 'graph'
  | 'dotted'
  | 'staff'
  | 'isometric'
  | 'cornell'
  | 'planner'

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

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export const isPaperBackgroundType = (v: unknown): v is PaperBackgroundType =>
  v === 'blank' ||
  v === 'ruled' ||
  v === 'graph' ||
  v === 'dotted' ||
  v === 'staff' ||
  v === 'isometric' ||
  v === 'cornell' ||
  v === 'planner'

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

// İzometrik grid (isometric): 60° açılı paralel çizgiler + dikey çizgiler (veya eşkenar üçgen ağı).
// standard 60-degree isometric grid çizgileri: y ekseni aralığı s, yatay adımı dx = s / sqrt(3).
export interface IsoLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

export const isometricLines = (
  pageW: number,
  pageH: number,
  spacing: number,
): IsoLine[] => {
  const s = clampSpacing(spacing)
  if (!(pageW > 0) || !(pageH > 0)) return []
  const lines: IsoLine[] = []

  // 1. Dikey çizgiler (dx = s)
  for (let x = s; x < pageW; x += s) {
    lines.push({ x1: x, y1: 0, x2: x, y2: pageH })
  }

  // 2. +30° eğimli çizgiler (dy / dx = 1 / sqrt(3) ~= tan(30°))
  // y = m*x + c, m = 1/sqrt(3) ~= 0.57735
  const m = 1 / Math.sqrt(3)
  // Adım dikeyde s
  // Sayfayı kesen çizgiler: c aralığı [-pageW * m, pageH]
  const cStep = s
  const minC = -pageW * m
  const maxC = pageH
  for (let c = Math.floor(minC / cStep) * cStep; c < maxC; c += cStep) {
    // Çizginin sayfa sınırlarıyla kesiştiği noktalar (0 <= x <= pageW, 0 <= y <= pageH)
    // x = 0 => y = c
    // x = pageW => y = m * pageW + c
    // y = 0 => x = -c / m
    // y = pageH => x = (pageH - c) / m
    const pts: { x: number; y: number }[] = []
    const yAt0 = c
    if (yAt0 >= 0 && yAt0 <= pageH) pts.push({ x: 0, y: yAt0 })
    const yAtW = m * pageW + c
    if (yAtW >= 0 && yAtW <= pageH) pts.push({ x: pageW, y: yAtW })
    if (m !== 0) {
      const xAt0 = -c / m
      if (xAt0 > 0 && xAt0 < pageW) pts.push({ x: xAt0, y: 0 })
      const xAtH = (pageH - c) / m
      if (xAtH > 0 && xAtH < pageW) pts.push({ x: xAtH, y: pageH })
    }
    const p0 = pts[0]
    const p1 = pts[1]
    if (p0 && p1) {
      lines.push({ x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y })
    }
  }

  // 3. -30° eğimli çizgiler (dy / dx = -1 / sqrt(3))
  for (let c = 0; c < pageH + pageW * m; c += cStep) {
    // y = -m * x + c
    const pts: { x: number; y: number }[] = []
    const yAt0 = c
    if (yAt0 >= 0 && yAt0 <= pageH) pts.push({ x: 0, y: yAt0 })
    const yAtW = -m * pageW + c
    if (yAtW >= 0 && yAtW <= pageH) pts.push({ x: pageW, y: yAtW })
    if (m !== 0) {
      const xAt0 = c / m
      if (xAt0 > 0 && xAt0 < pageW) pts.push({ x: xAt0, y: 0 })
      const xAtH = (c - pageH) / m
      if (xAtH > 0 && xAtH < pageW) pts.push({ x: xAtH, y: pageH })
    }
    const p0 = pts[0]
    const p1 = pts[1]
    if (p0 && p1) {
      lines.push({ x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y })
    }
  }

  return lines
}

// Cornell Not Şablonu:
// - Üst başlık alanı (header: y = 54pt)
// - Sol ipucu sütunu (cue column: x = pageW * 0.3)
// - Alt özet alanı (summary section: y = pageH - 90pt)
// - Sağ not alanında çizgili satırlar
export interface CornellLayout {
  headerY: number
  cueX: number
  summaryY: number
  ruledLines: { x1: number; y: number; x2: number }[]
}

export const cornellLayout = (
  pageW: number,
  pageH: number,
  spacing: number,
): CornellLayout | null => {
  if (pageW < 200 || pageH < 250) return null
  const s = clampSpacing(spacing)
  const headerY = Math.min(60, pageH * 0.12)
  const summaryY = Math.max(headerY + s * 4, pageH - Math.min(100, pageH * 0.18))
  const cueX = Math.round(pageW * 0.3)

  const ruledLines: { x1: number; y: number; x2: number }[] = []
  for (let y = headerY + s; y < summaryY - 2; y += s) {
    ruledLines.push({ x1: cueX, y, x2: pageW })
  }

  return {
    headerY,
    cueX,
    summaryY,
    ruledLines,
  }
}

// Planner / Görev Listesi Şablonu:
// - Üst başlık çizgisi (y = 50pt)
// - Sol to-do checkbox kareleri veya dikey ayrım (x = 32pt)
// - Yatay çizgiler (tüm genişlik boyunca)
// - Sağda öncelik/zaman sütunu (opsiyonel dikey çizgi, sayfa genişse x = pageW - 70pt)
export interface PlannerLayout {
  headerY: number
  checkboxXs: number[]
  ruledLines: number[]
  sideColX: number | null
}

export const plannerLayout = (
  pageW: number,
  pageH: number,
  spacing: number,
): PlannerLayout | null => {
  if (pageW < 160 || pageH < 200) return null
  const s = clampSpacing(spacing)
  const headerY = Math.min(50, pageH * 0.12)
  const ruledLines: number[] = []
  const checkboxXs: number[] = []

  for (let y = headerY + s; y < pageH - 10; y += s) {
    ruledLines.push(y)
    checkboxXs.push(16)
  }

  const sideColX = pageW > 350 ? Math.round(pageW - 80) : null

  return {
    headerY,
    checkboxXs,
    ruledLines,
    sideColX,
  }
}
