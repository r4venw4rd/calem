// Saf silgi-split geometrisi: polyline'ı daire-dışı koşulara böler.
// Render/store bağımsız — sayfa-uzayında (pt) çalışır, node'da test edilir.

import type { Point } from '../model/document'

// Segment-daire kesişim parametreleri (0..1 arası, sıralı). Teğet/uç-değme yok sayılır.
export const segmentCircleTs = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  r: number,
): number[] => {
  const dx = bx - ax
  const dy = by - ay
  const fx = ax - cx
  const fy = ay - cy
  const a = dx * dx + dy * dy
  if (a === 0) return []
  const b = 2 * (fx * dx + fy * dy)
  const c = fx * fx + fy * fy - r * r
  const disc = b * b - 4 * a * c
  if (disc <= 0) return []
  const sq = Math.sqrt(disc)
  const out: number[] = []
  for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
    if (t > 0 && t < 1) out.push(t)
  }
  return out.sort((p, q) => p - q)
}

const inside = (p: Point, cx: number, cy: number, r: number): boolean => {
  const dx = p.x - cx
  const dy = p.y - cy
  return dx * dx + dy * dy < r * r
}

const cutAt = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

const copyPt = (p: Point): Point => ({ x: p.x, y: p.y, pressure: p.pressure })

// Koşu boyu (polyline uzunluğu, pt). Silgi artığı eleme ölçüsü.
export const runLength = (run: Point[]): number => {
  let n = 0
  for (let i = 1; i < run.length; i++) {
    const dx = run[i]!.x - run[i - 1]!.x
    const dy = run[i]!.y - run[i - 1]!.y
    n += Math.hypot(dx, dy)
  }
  return n
}

// Silgi artığı eleme: boyu eşiğin altındaki koşular atılır. Tek noktalı koşu
// her zaman artıktır (nokta gibi çizilip "2 küçük yuvarlak" bırakır). Eşik
// silgi yarıçapına oranlı verilir (çağıran: max(2, radius * 0.5)).
export const dropTinyRuns = (runs: Point[][], minLen: number): Point[][] =>
  runs.filter((r) => r.length > 1 && runLength(r) >= minLen)

// Daire dışında kalan koşular. Kesim noktaları eklenir (temiz kenar).
// Dokunulmadıysa [orijinal dizi] (aynı referans değil, içerik aynı).
export const splitRunsOutside = (pts: Point[], cx: number, cy: number, r: number): Point[][] => {
  if (pts.length === 0) return []
  if (pts.length === 1) return inside(pts[0]!, cx, cy, r) ? [] : [pts.map(copyPt)]
  const runs: Point[][] = []
  let cur: Point[] = []
  const first = pts[0]!
  if (!inside(first, cx, cy, r)) cur.push(copyPt(first))
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]!
    const p = pts[i]!
    const prevIn = inside(prev, cx, cy, r)
    const curIn = inside(p, cx, cy, r)
    if (!prevIn && curIn) {
      // Dışarıdan içeri: kesimde koş biter.
      for (const t of segmentCircleTs(prev.x, prev.y, p.x, p.y, cx, cy, r)) {
        cur.push(cutAt(prev, p, t))
      }
      if (cur.length > 0) {
        runs.push(cur)
        cur = []
      }
    } else if (prevIn && !curIn) {
      // İçeriden dışarı: kesimle yeni koş başlar.
      for (const t of segmentCircleTs(prev.x, prev.y, p.x, p.y, cx, cy, r)) {
        cur.push(cutAt(prev, p, t))
      }
      cur.push(copyPt(p))
    } else if (!prevIn && !curIn) {
      // İkisi de dışarıda: yay daireyi kesiyorsa orta parça silinir.
      const ts = segmentCircleTs(prev.x, prev.y, p.x, p.y, cx, cy, r)
      if (ts.length === 2) {
        cur.push(cutAt(prev, p, ts[0]!))
        runs.push(cur)
        cur = [cutAt(prev, p, ts[1]!)]
      }
      cur.push(copyPt(p))
    }
    // İkisi de içerde: koşuya hiçbir şey (silinen orta).
  }
  if (cur.length > 0) runs.push(cur)
  return runs
}
