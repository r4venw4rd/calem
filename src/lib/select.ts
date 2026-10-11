// Saf seçim geometrisi (Faz 2). Sayfa-uzayında (pt) çalışır, render/Pinia bağımsız.
// Kural: seçim bbox üzerinden — hızlı ve öngörülebilir. Nokta-içi testi lassoda.

import type { Point, Stroke } from '../model/document'

export interface NormRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

type BBoxStroke = Pick<Stroke, 'points' | 'width'>

// Stroke'un kirli kutusu: nokta sınırları + yarı kalınlık payı.
// Tek nokta da seçilebilsin diye minimum 2pt pay.
export const strokeBBox = (s: BBoxStroke): NormRect | null => {
  const pts = s.points
  if (!pts || pts.length === 0) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of pts) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
    if (p.x < x0) x0 = p.x
    if (p.y < y0) y0 = p.y
    if (p.x > x1) x1 = p.x
    if (p.y > y1) y1 = p.y
  }
  if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) {
    return null
  }
  const pad = Math.max((typeof s.width === 'number' && Number.isFinite(s.width) ? s.width : 3) / 2, 2)
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad }
}

// İki ucu normalize et (sürükleme her yöne olabilir).
export const normRect = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
): NormRect => ({
  x0: Math.min(ax, bx),
  y0: Math.min(ay, by),
  x1: Math.max(ax, bx),
  y1: Math.max(ay, by),
})

export const rectsOverlap = (a: NormRect, b: NormRect): boolean =>
  a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0

// İki kutuyu kapsayacak en küçük kutu (kirli-bölge biriktirme).
export const unionRect = (a: NormRect, b: NormRect): NormRect => ({
  x0: Math.min(a.x0, b.x0),
  y0: Math.min(a.y0, b.y0),
  x1: Math.max(a.x1, b.x1),
  y1: Math.max(a.y1, b.y1),
})

// Kutuya her yönde pay ekle (AA / kalınlık taşması için).
export const expandRect = (r: NormRect, pad: number): NormRect => ({
  x0: r.x0 - pad,
  y0: r.y0 - pad,
  x1: r.x1 + pad,
  y1: r.y1 + pad,
})

// Nokta etrafında kare kutu (silgi dairesi → kirli kutu).
export const rectAround = (x: number, y: number, rad: number): NormRect => ({
  x0: x - rad,
  y0: y - rad,
  x1: x + rad,
  y1: y + rad,
})

export const pointInRect = (x: number, y: number, r: NormRect): boolean =>
  x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1

// Klasik ray-casting. Kenar üstü tanımsız sayılır (içinde kabul).
export const pointInPolygon = (
  x: number,
  y: number,
  poly: { x: number; y: number }[],
): boolean => {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]!.x
    const yi = poly[i]!.y
    const xj = poly[j]!.x
    const yj = poly[j]!.y
    if (yi === yj) continue
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

// Bir nokta koşusunu, verilen kutuyla kesişen KISIMLARIYLA sınırlar (kısmi repaint).
// Dev bir stroke her frame baştan tessellate edilmesin: yalnız kutunun yakınındaki
// noktalar çizilir. neighborPad = Catmull-Rom kontrol-komşusu payı (kesişen segmentin
// eğrisi birebir aynı çıksın diye +-2 nokta).
// NOT: Dönen koşular ORIJINAL dizinin dilimleri (element referansları korunur).
export const subRunsInRect = (
  pts: readonly Point[],
  rect: NormRect,
  inflate: number,
  neighborPad = 2,
): Point[][] => {
  const n = pts.length
  if (n === 0) return []
  const r = expandRect(rect, inflate)
  if (n === 1) {
    const p = pts[0]!
    return p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1 ? [[p]] : []
  }
  const keep = new Array<boolean>(n).fill(false)
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const sx0 = Math.min(a.x, b.x)
    const sx1 = Math.max(a.x, b.x)
    const sy0 = Math.min(a.y, b.y)
    const sy1 = Math.max(a.y, b.y)
    if (sx1 < r.x0 || sx0 > r.x1 || sy1 < r.y0 || sy0 > r.y1) continue
    keep[i] = true
    keep[i + 1] = true
  }
  // Komşu payıyla genişlet (kesişen segmentin kontrol noktaları dahil olsun).
  const dil = new Array<boolean>(n).fill(false)
  for (let i = 0; i < n; i++) {
    if (!keep[i]) continue
    const lo = Math.max(0, i - neighborPad)
    const hi = Math.min(n - 1, i + neighborPad)
    for (let j = lo; j <= hi; j++) dil[j] = true
  }
  const runs: Point[][] = []
  let start = -1
  for (let i = 0; i < n; i++) {
    if (dil[i] && start === -1) start = i
    else if (!dil[i] && start !== -1) {
      runs.push(pts.slice(start, i))
      start = -1
    }
  }
  if (start !== -1) runs.push(pts.slice(start, n))
  return runs
}

// Coalesced olaylar: donanım biriktirir, sentetik/CDP boş dönebilir.
// Boşsa olayın kendisi kullanılır (nokta kaybı olmasın).
export const coalescedOf = (e: PointerEvent): PointerEvent[] => {
  if (typeof e.getCoalescedEvents === 'function') {
    const list = e.getCoalescedEvents()
    if (list.length > 0) return list as PointerEvent[]
  }
  return [e]
}
export const selectByRect = (
  strokes: Pick<Stroke, 'id' | 'points' | 'width'>[],
  a: { x: number; y: number },
  b: { x: number; y: number },
): string[] => {
  const r = normRect(a.x, a.y, b.x, b.y)
  const tiny = r.x1 - r.x0 < 3 && r.y1 - r.y0 < 3
  const out: string[] = []
  // Üstteki (son çizilen) önce — tıklamada en üstteki yakalanır.
  for (let i = strokes.length - 1; i >= 0; i--) {
    const s = strokes[i]!
    const bb = strokeBBox(s)
    if (!bb) continue
    if (tiny) {
      if (pointInRect((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, bb)) return [s.id]
    } else if (rectsOverlap(r, bb)) {
      out.push(s.id)
    }
  }
  return tiny ? [] : out.reverse()
}

// Lasso seçim: herhangi bir noktası poligon içinde kalan stroke'lar.
// Not: noktasız-kesişim (uzun çizgi lassoyu keser ama noktası içerde değil)
// v1'de yakalanmaz — desimasyon aralığı küçük, pratikte sorun değil.
export const selectByLasso = (
  strokes: Pick<Stroke, 'id' | 'points'>[],
  poly: { x: number; y: number }[],
): string[] => {
  if (poly.length < 3) return []
  let px0 = Infinity
  let py0 = Infinity
  let px1 = -Infinity
  let py1 = -Infinity
  for (const p of poly) {
    if (p.x < px0) px0 = p.x
    if (p.y < py0) py0 = p.y
    if (p.x > px1) px1 = p.x
    if (p.y > py1) py1 = p.y
  }
  const out: string[] = []
  for (const s of strokes) {
    const pts = s.points
    if (!pts || pts.length === 0) continue
    let hit = false
    for (const p of pts) {
      if (p.x < px0 || p.x > px1 || p.y < py0 || p.y > py1) continue
      if (pointInPolygon(p.x, p.y, poly)) {
        hit = true
        break
      }
    }
    if (hit) out.push(s.id)
  }
  return out
}

// Seçili stroke'ların birleşik kutusu (overlay bbox çizimi için).
export const selectionBBox = (
  strokes: Pick<Stroke, 'id' | 'points' | 'width'>[],
  ids: readonly string[],
): NormRect | null => {
  if (ids.length === 0) return null
  const set = new Set(ids)
  let acc: NormRect | null = null
  for (const s of strokes) {
    if (!set.has(s.id)) continue
    const bb = strokeBBox(s)
    if (!bb) continue
    if (!acc) {
      acc = { ...bb }
    } else {
      if (bb.x0 < acc.x0) acc.x0 = bb.x0
      if (bb.y0 < acc.y0) acc.y0 = bb.y0
      if (bb.x1 > acc.x1) acc.x1 = bb.x1
      if (bb.y1 > acc.y1) acc.y1 = bb.y1
    }
  }
  return acc
}

/** Noktanın doğru parçasına (a -> b) dik uzaklığı. */
const distToSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  if (l2 === 0) return Math.hypot(px - ax, py - ay)
  let t = ((px - ax) * dx + (py - ay) * dy) / l2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/**
 * Bir noktanın belirli bir stroke'un çizgisine veya kapalı iç bölgesine yakın olup olmadığını test eder.
 */
export const pointNearStroke = (
  x: number,
  y: number,
  s: Pick<Stroke, 'points' | 'width'>,
  hitRadius = 14,
): boolean => {
  const pts = s.points
  if (!pts || pts.length === 0) return false
  const bb = strokeBBox(s)
  if (!bb) return false

  // Bounding box dışında mı?
  if (x < bb.x0 - hitRadius || x > bb.x1 + hitRadius || y < bb.y0 - hitRadius || y > bb.y1 + hitRadius) {
    return false
  }

  // 1. Kapalı poligon ise (örneğin üçgen/kutu) iç bölgesine tıklandığında da seçilebilmeli!
  const first = pts[0]!
  const last = pts[pts.length - 1]!
  const isClosed = pts.length >= 3 && Math.hypot(first.x - last.x, first.y - last.y) < Math.max(24, (bb.x1 - bb.x0) * 0.25)
  if (isClosed && pointInPolygon(x, y, pts)) {
    return true
  }

  // 2. Çizgi segmentlerine dik mesafe testi (vuruş toleransı)
  const threshold = Math.max(hitRadius, (s.width || 3) / 2 + 6)
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const d = distToSeg(x, y, a.x, a.y, b.x, b.y)
    if (d <= threshold) return true
  }

  // Tek nokta durumu
  if (pts.length === 1) {
    return Math.hypot(x - pts[0]!.x, y - pts[0]!.y) <= threshold
  }

  return false
}

/**
 * Tıklanan noktadaki en üstteki stroke'u bulur (hızlı tekil seçim).
 */
export const strokeAtPoint = (
  strokes: Pick<Stroke, 'id' | 'points' | 'width'>[],
  x: number,
  y: number,
  hitRadius = 14,
): string | null => {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const s = strokes[i]!
    if (pointNearStroke(x, y, s, hitRadius)) {
      return s.id
    }
  }
  return null
}
