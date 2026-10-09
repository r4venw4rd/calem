import { describe, expect, it } from 'vitest'
import {
  coalescedOf,
  normRect,
  pointInPolygon,
  pointInRect,
  rectsOverlap,
  selectByLasso,
  selectByRect,
  selectionBBox,
  strokeBBox,
} from '../src/lib/select'

const S = (id: string, pts: { x: number; y: number }[], width = 3) => ({
  id,
  points: pts,
  width,
})

describe('strokeBBox', () => {
  it('bos nokta null', () => {
    expect(strokeBBox({ points: [], width: 3 })).toBeNull()
  })
  it('kalinlik payi birakir', () => {
    const bb = strokeBBox(S('a', [{ x: 10, y: 10 }], 10))!
    expect(bb.x0).toBeLessThan(10)
    expect(bb.x1).toBeGreaterThan(10)
    expect(bb.x1 - bb.x0).toBeGreaterThanOrEqual(10)
  })
})

describe('rect yardimcilari', () => {
  it('normRect yon bagimsiz', () => {
    expect(normRect(5, 5, 1, 1)).toEqual({ x0: 1, y0: 1, x1: 5, y1: 5 })
  })
  it('rectsOverlap kesisim', () => {
    const a = normRect(0, 0, 10, 10)
    expect(rectsOverlap(a, normRect(5, 5, 15, 15))).toBe(true)
    expect(rectsOverlap(a, normRect(11, 11, 20, 20))).toBe(false)
  })
  it('pointInRect sinir dahil', () => {
    const r = normRect(0, 0, 10, 10)
    expect(pointInRect(10, 10, r)).toBe(true)
    expect(pointInRect(10.1, 5, r)).toBe(false)
  })
  it('pointInPolygon kare', () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    expect(pointInPolygon(5, 5, sq)).toBe(true)
    expect(pointInPolygon(15, 5, sq)).toBe(false)
  })
})

describe('selectByRect', () => {
  const strokes = [
    S('a', [{ x: 5, y: 5 }]),
    S('b', [{ x: 50, y: 50 }]),
  ]
  it('kesenleri toplar', () => {
    expect(selectByRect(strokes, { x: 0, y: 0 }, { x: 60, y: 60 })).toEqual(['a', 'b'])
    expect(selectByRect(strokes, { x: 40, y: 40 }, { x: 60, y: 60 })).toEqual(['b'])
  })
  it('minik tik en ustteki', () => {
    expect(selectByRect(strokes, { x: 5, y: 5 }, { x: 5, y: 5 })).toEqual(['a'])
    expect(selectByRect(strokes, { x: 200, y: 200 }, { x: 200, y: 200 })).toEqual([])
  })
})

describe('selectByLasso', () => {
  const strokes = [S('a', [{ x: 5, y: 5 }]), S('b', [{ x: 50, y: 50 }])]
  const sq = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]
  it('icerdeki noktayi yakalar', () => {
    expect(selectByLasso(strokes, sq)).toEqual(['a'])
  })
  it('3ten az nokta bos', () => {
    expect(selectByLasso(strokes, [{ x: 0, y: 0 }])).toEqual([])
  })
})

describe('selectionBBox', () => {
  it('bosta null, secilide birlesim', () => {
    const strokes = [S('a', [{ x: 0, y: 0 }]), S('b', [{ x: 100, y: 100 }])]
    expect(selectionBBox(strokes, [])).toBeNull()
    const bb = selectionBBox(strokes, ['a', 'b'])!
    expect(bb.x0).toBeLessThan(0)
    expect(bb.x1).toBeGreaterThan(100)
  })
})

describe('coalescedOf', () => {
  it('metotsuz olayda kendisi', () => {
    const e = { pointerId: 1 } as unknown as PointerEvent
    expect(coalescedOf(e)).toEqual([e])
  })
  it('bos listede kendisi', () => {
    const e = { getCoalescedEvents: () => [] } as unknown as PointerEvent
    expect(coalescedOf(e)).toEqual([e])
  })
  it('dolu listeyi aynen verir', () => {
    const inner = { pointerId: 2 }
    const e = { getCoalescedEvents: () => [inner] } as unknown as PointerEvent
    expect(coalescedOf(e)).toEqual([inner])
  })
})
