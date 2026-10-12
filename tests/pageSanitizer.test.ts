import { describe, expect, it } from 'vitest'
import { cleanStrokes, pageFromRaw, pageSizeOf } from '../src/persist/pageSanitizer'

describe('page sanitizer numeric bounds', () => {
  it('replaces invalid stroke widths and clamps non-finite or out-of-range pressure', () => {
    const [stroke] = cleanStrokes([
      {
        width: Number.NaN,
        points: [
          { x: 1, y: 2, pressure: Number.NaN },
          { x: 3, y: 4, pressure: 2 },
          { x: 5, y: 6, pressure: -1 },
        ],
      },
    ])
    expect(stroke?.width).toBe(3)
    expect(stroke?.points.map((point) => point.pressure)).toEqual([0.5, 1, 0])
  })

  it('uses the fallback for non-finite page dimensions', () => {
    expect(pageSizeOf({ size: { w: Infinity, h: 842 } }, { w: 600, h: 800 })).toEqual({ w: 600, h: 800 })
  })

  it('assigns legacy images to the bottom layer and preserves valid layer references', () => {
    const page = pageFromRaw(
      {
        layers: [
          { id: 'bottom', name: 'Bottom', visible: true, strokes: [] },
          { id: 'top', name: 'Top', visible: true, strokes: [] },
        ],
        images: [
          { id: 'legacy', fileId: 'legacy-file', x: 0, y: 0, w: 20, h: 20 },
          { id: 'layered', layerId: 'top', fileId: 'top-file', x: 0, y: 0, w: 20, h: 20 },
          { id: 'invalid', layerId: 'missing', fileId: 'bad-layer-file', x: 0, y: 0, w: 20, h: 20 },
        ],
      },
      { w: 600, h: 800 },
    )

    expect(page?.images.map((img) => img.layerId)).toEqual(['bottom', 'top', 'bottom'])
  })
})
