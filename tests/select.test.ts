import { describe, expect, it } from 'vitest'
import {
  coalescedOf,
  expandRect,
  normRect,
  pointInPolygon,
  pointInRect,
  rectAround,
  rectsOverlap,
  selectByLasso,
  selectByRect,
  selectionBBox,
  strokeBBox,
  subRunsInRect,
  unionRect,
  pointNearStroke,
  strokeAtPoint,
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
  it('unionRect iki kutuyu kapsar', () => {
    expect(unionRect(normRect(0, 0, 10, 10), normRect(5, 5, 20, 20))).toEqual({
      x0: 0,
      y0: 0,
      x1: 20,
      y1: 20,
    })
  })
  it('expandRect her yonde pay ekler', () => {
    expect(expandRect(normRect(10, 10, 20, 20), 3)).toEqual({ x0: 7, y0: 7, x1: 23, y1: 23 })
  })
  it('rectAround nokta etrafinda kare', () => {
    expect(rectAround(50, 40, 6)).toEqual({ x0: 44, y0: 34, x1: 56, y1: 46 })
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

describe('subRunsInRect', () => {
  const line = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i, y: 0, pressure: 0.5 }))

  it('kutudan uzak kosu yok', () => {
    expect(subRunsInRect(line(20), normRect(100, -1, 101, 1), 0)).toEqual([])
  })

  it('kesisen segmenti + komsu payiyla dondurur', () => {
    const runs = subRunsInRect(line(20), normRect(9.5, -1, 10.5, 1), 0)
    expect(runs.length).toBe(1)
    // kesişen segmentler 9 ve 10 → nokta 9,10,11 → +-2 pad → 7..13 (7 nokta)
    expect(runs[0]!.length).toBe(7)
    expect(runs[0]![0]!.x).toBe(7)
    expect(runs[0]![6]!.x).toBe(13)
  })

  it('tek nokta icerde/disarda', () => {
    const p = [{ x: 5, y: 5, pressure: 1 }]
    expect(subRunsInRect(p, normRect(0, 0, 10, 10), 0)).toEqual([p])
    expect(subRunsInRect(p, normRect(50, 50, 60, 60), 0)).toEqual([])
  })

  it('inflate payi esigi genisletir', () => {
    // line y=0, kutu y=3 → inflate yoksa kesismez, 4 ile kesisir
    expect(subRunsInRect(line(20), normRect(9.5, 3, 10.5, 4), 0)).toEqual([])
    expect(subRunsInRect(line(20), normRect(9.5, 3, 10.5, 4), 4).length).toBe(1)
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

describe('strokeAtPoint & pointNearStroke', () => {
  it('ucgenin kenarina veya icine tiklayinca secilir', () => {
    // Ucgen (50, 10), (100, 90), (0, 90), (50, 10)
    const triPts = [
      { x: 50, y: 10 },
      { x: 100, y: 90 },
      { x: 0, y: 90 },
      { x: 50, y: 10 },
    ]
    const s = S('tri', triPts, 3)
    // Ucgenin icine tiklama
    expect(pointNearStroke(50, 60, s)).toBe(true)
    // Ucgenin kenarina yakin tiklama
    expect(pointNearStroke(52, 12, s)).toBe(true)
    // Ucgenin tamamen disina tiklama
    expect(pointNearStroke(200, 200, s)).toBe(false)
    expect(strokeAtPoint([s], 50, 60)).toBe('tri')
  })
})

