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
  if (!(r > 0)) return []
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

// Polyline daireye DEĞİYOR MU (herhangi nokta içeride veya herhangi segment daireyi kesiyor)?
// splitRunsOutside ile AYNI değişim koşulu, ama HİÇ AYIRIM YAPMAZ (no-op kopya/GC yok).
// Yoğun sayfa-kaplayan stroke'larda silgi yolunun nokta başına tam kopyasını önler.
export const polylineHitsCircle = (
  pts: Point[],
  cx: number,
  cy: number,
  r: number,
): boolean => {
  const n = pts.length
  if (n === 0) return false
  if (!(r > 0)) return false
  if (n === 1) return inside(pts[0]!, cx, cy, r)
  if (inside(pts[0]!, cx, cy, r)) return true
  for (let i = 1; i < n; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    if (inside(b, cx, cy, r)) return true
    if (segmentCircleTs(a.x, a.y, b.x, b.y, cx, cy, r).length > 0) return true
  }
  return false
}

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
  if (!(r > 0)) return [pts.map(copyPt)]
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

// Cut a sampled circular eraser sweep in one pass per stroke segment.
export const splitPolylineOutsideSweep = (
  pts: Point[], path: { x: number; y: number }[], radius: number,
): Point[][] => {
  if (!pts.length || !path.length || !(radius > 0)) return pts.length ? [pts] : []
  const cell = Math.max(radius * 2, 1)
  const grid = new Map<string, { x: number; y: number }[]>()
  for (const p of path) {
    const key = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`
    const bucket = grid.get(key)
    if (bucket) bucket.push(p)
    else grid.set(key, [p])
  }
  const candidatesFor = (a: Point, b: Point) => {
    const out: { x: number; y: number }[] = []
    const seen = new Set<{ x: number; y: number }>()
    for (let y = Math.floor((Math.min(a.y, b.y) - radius) / cell); y <= Math.floor((Math.max(a.y, b.y) + radius) / cell); y++) {
      for (let x = Math.floor((Math.min(a.x, b.x) - radius) / cell); x <= Math.floor((Math.max(a.x, b.x) + radius) / cell); x++) {
        for (const p of grid.get(`${x}:${y}`) ?? []) if (!seen.has(p)) { seen.add(p); out.push(p) }
      }
    }
    return out
  }
  const out: Point[][] = []
  let run: Point[] = []
  let changed = false
  const end = () => { if (run.length) out.push(run); run = [] }
  if (pts.length === 1) return polylineHitsCircle(path, pts[0]!.x, pts[0]!.y, radius) ? [] : [pts]
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    const candidates = candidatesFor(a, b)
    const ts = [0, 1]
    for (const c of candidates) ts.push(...segmentCircleTs(a.x, a.y, b.x, b.y, c.x, c.y, radius))
    ts.sort((x, y) => x - y)
    const cuts = ts.filter((t, j) => j === 0 || t - ts[j - 1]! > 1e-9)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const pointAt = (t: number): Point => ({
      x: a.x + dx * t,
      y: a.y + dy * t,
      ...((a.pressure !== undefined || b.pressure !== undefined)
        ? { pressure: (a.pressure ?? 1) + ((b.pressure ?? 1) - (a.pressure ?? 1)) * t }
        : {}),
    })
    for (let j = 0; j + 1 < cuts.length; j++) {
      const lo = cuts[j]!
      const hi = cuts[j + 1]!
      const mid = pointAt((lo + hi) / 2)
      const erased = candidates.some((c) => (mid.x - c.x) ** 2 + (mid.y - c.y) ** 2 < radius * radius)
      if (erased) {
        if (run.length) run.push(pointAt(lo))
        end()
        changed = true
      } else {
        if (!run.length) run.push(pointAt(lo))
        run.push(pointAt(hi))
      }
    }
  }
  end()
  return changed ? out : [pts]
}
