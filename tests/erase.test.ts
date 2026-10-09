import { describe, expect, it } from 'vitest'
import { segmentCircleTs, splitRunsOutside } from '../src/lib/erase'

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
