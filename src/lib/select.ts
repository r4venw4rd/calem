// Saf seçim geometrisi (Faz 2). Sayfa-uzayında (pt) çalışır, render/Pinia bağımsız.
// Kural: seçim bbox üzerinden — hızlı ve öngörülebilir. Nokta-içi testi lassoda.

import type { Stroke } from '../stores/drawing'

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

// Dikdörtgen seçim: bbox'u kesişen stroke'lar. Küçük tıklama (3pt altı)
// nokta seçimi sayılır — altında kalan ilk stroke döner.
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
