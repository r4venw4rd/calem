import { describe, expect, it } from 'vitest'
import {
  dropTinyRuns,
  polylineHitsCircle,
  runLength,
  segmentCircleTs,
  splitPolylineOutsideSweep,
  splitRunsOutside,
} from '../src/lib/erase'

const P = (x: number, y: number) => ({ x, y })

describe('segmentCircleTs', () => {
  it('kesisim parametreleri', () => {
    const ts = segmentCircleTs(0, 0, 10, 0, 5, 0, 2)
    expect(ts).toHaveLength(2)
    expect(ts[0]).toBeCloseTo(0.3, 9)
    expect(ts[1]).toBeCloseTo(0.7, 9)
  })
  it('iskalamada bos', () => {
    expect(segmentCircleTs(0, 0, 10, 0, 5, 5, 1)).toEqual([])
  })
  it('tegette bos', () => {
    expect(segmentCircleTs(0, 0, 10, 0, 5, 2, 2)).toEqual([])
  })
})

describe('splitRunsOutside', () => {
  it('ortayi keser, temiz kenar birakir', () => {
    const pts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((x) => P(x, 0))
    const runs = splitRunsOutside(pts, 5, 0, 2)
    expect(runs).toHaveLength(2)
    expect([runs[0][0].x, runs[0].at(-1)!.x]).toEqual([0, 3])
    expect([runs[1][0].x, runs[1].at(-1)!.x]).toEqual([7, 10])
  })
  it('dokunulmayani aynen birakir', () => {
    const pts = [P(0, 0), P(1, 0), P(2, 0)]
    const runs = splitRunsOutside(pts, 50, 50, 3)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toHaveLength(3)
  })
  it('tamami icerdeyse bos', () => {
    expect(splitRunsOutside([P(4, 0), P(5, 0), P(6, 0)], 5, 0, 3)).toEqual([])
  })
  it('tek nokta', () => {
    expect(splitRunsOutside([P(5, 0)], 5, 0, 3)).toEqual([])
    expect(splitRunsOutside([P(0, 0)], 5, 0, 3)).toHaveLength(1)
  })
  it('yay kesiminde orta gider', () => {
    const runs = splitRunsOutside([P(0, 0), P(10, 0)], 5, 3, 4)
    expect(runs).toHaveLength(2)
    expect(runs[0][0].x).toBe(0)
    expect(runs[0].at(-1)!.x).toBeCloseTo(5 - Math.sqrt(7), 9)
    expect(runs[1][0].x).toBeCloseTo(5 + Math.sqrt(7), 9)
    expect(runs[1].at(-1)!.x).toBe(10)
  })
})

describe('polylineHitsCircle', () => {
  it('ic nokta / kesen segment / uzak', () => {
    const pts = [P(0, 0), P(10, 0)]
    expect(polylineHitsCircle(pts, 5, 0, 3)).toBe(true) // segment kesiyor
    expect(polylineHitsCircle(pts, 5, 10, 1)).toBe(false) // uzak
    expect(polylineHitsCircle([P(5, 0)], 5, 0, 1)).toBe(true) // tek nokta içeride
    expect(polylineHitsCircle([P(5, 0)], 50, 0, 1)).toBe(false)
  })
  it('splitRunsOutside ile aynı kararı verir (no-op tespiti)', () => {
    const cases: [{ x: number; y: number }[], number, number, number][] = [
      [[P(0, 0), P(1, 0), P(2, 0)], 50, 50, 3],
      [[P(0, 0), P(10, 0)], 5, 0, 2],
      [[P(4, 0), P(5, 0), P(6, 0)], 5, 0, 3],
      [[P(0, 0), P(10, 0)], 5, 3, 4],
    ]
    for (const [pts, cx, cy, r] of cases) {
      const runs = splitRunsOutside(pts, cx, cy, r)
      const changed = !(runs.length === 1 && runs[0].length === pts.length)
      expect(polylineHitsCircle(pts, cx, cy, r)).toBe(changed)
    }
  })
})

describe('splitPolylineOutsideSweep', () => {
  it('swept disk cuts a long stroke in one sweep and keeps both outside runs', () => {
    const pts = Array.from({ length: 101 }, (_, i) => P(i, 0))
    const runs = splitPolylineOutsideSweep(pts, Array.from({ length: 11 }, (_, i) => P(40 + i * 2, 0)), 3)
    expect(runs).toHaveLength(2)
    expect(runs[0]!.at(-1)!.x).toBeCloseTo(37, 5)
    expect(runs[1]![0]!.x).toBeCloseTo(63, 5)
    expect(runs[0]!.every((p) => p.pressure === undefined)).toBe(true)
  })

  it('returns the original run when the sweep misses', () => {
    const pts = [P(0, 0), P(10, 0)]
    const runs = splitPolylineOutsideSweep(pts, [P(0, 20), P(10, 20)], 2)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toBe(pts)
  })
})

describe('dropTinyRuns', () => {
  it('tek nokta ve kisa kosulari atar', () => {
    const runs = [[P(0, 0)], [P(0, 0), P(1, 0)], [P(0, 0), P(10, 0)]]
    expect(runLength(runs[1]!)).toBeCloseTo(1, 9)
    const kept = dropTinyRuns(runs, 2)
    expect(kept).toHaveLength(1)
    expect(kept[0]).toHaveLength(2)
  })
  it('yuvarlak silmede nokta artigi birakmaz', () => {
    // r=8 cember, kenardan r=3 silgi: 2 noktalik 1.14pt kirinti elenir, ana yay kalir.
    const pts = Array.from({ length: 32 }, (_, i) => {
      const a = (i / 32) * Math.PI * 2
      return P(8 * Math.cos(a), 8 * Math.sin(a))
    })
    const runs = splitRunsOutside(pts, 7, 4, 3)
    expect(runs).toHaveLength(2)
    const kept = dropTinyRuns(runs, Math.max(2, 3 * 0.5))
    expect(kept).toHaveLength(1)
    for (const r of kept) {
      expect(r.length).toBeGreaterThan(1)
      expect(runLength(r)).toBeGreaterThanOrEqual(2)
    }
  })
})
