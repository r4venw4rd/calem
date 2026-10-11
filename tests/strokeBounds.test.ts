import { describe, expect, it } from 'vitest'
import { cachedStrokeBBox, invalidateStrokeBBox } from '../src/lib/strokeBounds'
import type { Stroke } from '../src/model/document'

describe('cached stroke bounds', () => {
  it('reuses bounds until point geometry changes, then recomputes', () => {
    const stroke: Stroke = {
      id: 's1', tool: 'pen', color: '#000000', width: 2, dash: 'solid', opacity: 1,
      points: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
    }
    const before = cachedStrokeBBox(stroke)
    stroke.points[1]!.x = 9
    expect(cachedStrokeBBox(stroke)).toBe(before)
    invalidateStrokeBBox(stroke)
    expect(cachedStrokeBBox(stroke)?.x1).toBe(11)
  })
})
