// Saf görünüm/şekil geometrisi: sayfa-uzayı, render/store bağımsız, node'da test edilir.

import type { Point } from '../model/document'

// Contain-fit: bitmap CSS boyutu + hedef CSS boyut → ölçek + offset.
export const fitContain = (bw: number, bh: number, cssW: number, cssH: number) => {
  const scale = Math.min(cssW / bw, cssH / bh)
  const dw = bw * scale
  const dh = bh * scale
  return { scale, ox: (cssW - dw) / 2, oy: (cssH - dh) / 2, dw, dh }
}

// Şekil uç noktaları: ilk + son nokta (ara noktalar serbest çizim artığıdır).
export const shapeEndpoints = (pts: Point[]): [Point, Point] | null => {
  if (pts.length === 0) return null
  return [pts[0]!, pts[pts.length - 1]!]
}

// Test edilebilir saf kural: ihtiyaç mevcudun %20 üstündeyse yeniden render et.
// (Sürekli üret-tüket döngüsüne girmemesi için histerezis şart.)
export const needsPdfRerender = (current: number, need: number): boolean =>
  Number.isFinite(current) &&
  Number.isFinite(need) &&
  current > 0 &&
  need > current * 1.2
