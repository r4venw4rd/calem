import { describe, expect, it } from 'vitest'
import { fitContain, needsPdfRerender, shapeEndpoints } from '../src/lib/geometry'

describe('fitContain', () => {
  it('dar hedefte yukseklige gore', () => {
    const f = fitContain(100, 200, 50, 200)
    expect(f.scale).toBeCloseTo(0.5, 9)
    expect(f.dw).toBeCloseTo(50, 9)
    expect(f.ox).toBeCloseTo(0, 9)
  })
  it('genis hedefte ortalar', () => {
    const f = fitContain(100, 100, 200, 100)
    expect(f.scale).toBe(1)
    expect(f.ox).toBeCloseTo(50, 9)
    expect(f.oy).toBeCloseTo(0, 9)
  })
})

describe('shapeEndpoints', () => {
  it('bos dizide null', () => {
    expect(shapeEndpoints([])).toBeNull()
  })
  it('ilk + son nokta', () => {
    const ends = shapeEndpoints([
      { x: 1, y: 2 },
      { x: 5, y: 5 },
      { x: 9, y: 0 },
    ])!
    expect([ends[0].x, ends[0].y]).toEqual([1, 2])
    expect([ends[1].x, ends[1].y]).toEqual([9, 0])
  })
})

describe('needsPdfRerender', () => {
  it('%20 histerezis', () => {
    expect(needsPdfRerender(100, 100)).toBe(false)
    expect(needsPdfRerender(100, 119)).toBe(false)
    expect(needsPdfRerender(100, 121)).toBe(true)
    expect(needsPdfRerender(0, 50)).toBe(false)
  })
})
