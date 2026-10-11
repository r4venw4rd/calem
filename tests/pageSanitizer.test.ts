import { describe, expect, it } from 'vitest'
import { cleanStrokes, pageSizeOf } from '../src/persist/pageSanitizer'

describe('page sanitizer numeric bounds', () => {
  it('replaces invalid stroke widths and clamps non-finite or out-of-range pressure', () => {
    const [stroke] = cleanStrokes([{
      width: Number.NaN,
      points: [
        { x: 1, y: 2, pressure: Number.NaN },
        { x: 3, y: 4, pressure: 2 },
        { x: 5, y: 6, pressure: -1 },
      ],
    }])
    expect(stroke?.width).toBe(3)
    expect(stroke?.points.map((point) => point.pressure)).toEqual([0.5, 1, 0])
  })

  it('uses the fallback for non-finite page dimensions', () => {
    expect(pageSizeOf({ size: { w: Infinity, h: 842 } }, { w: 600, h: 800 })).toEqual({ w: 600, h: 800 })
  })
})
