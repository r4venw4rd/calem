import { describe, expect, it } from 'vitest'
import type { Stroke } from '../src/model/document'
import { normRect, subRunsInRect } from '../src/lib/select'
import { indexedSubRunsInRect, invalidateStrokeSpatialIndex } from '../src/lib/strokeSpatialIndex'

const stroke = (points: Stroke['points']): Stroke => ({
  id: 'test', tool: 'pen', color: '#000000', width: 2, dash: 'solid', opacity: 1, points,
})

describe('indexedSubRunsInRect', () => {
  it('matches linear clipping for a long path and invalidates after moving it', () => {
    const s = stroke(Array.from({ length: 1000 }, (_, i) => ({ x: i, y: Math.sin(i / 10) * 20 })))
    const rect = normRect(450, -5, 470, 5)
    expect(indexedSubRunsInRect(s, rect, 3)).toEqual(subRunsInRect(s.points, rect, 3))
    s.points = s.points.map((p) => ({ ...p, y: p.y + 100 }))
    invalidateStrokeSpatialIndex(s)
    expect(indexedSubRunsInRect(s, rect, 3)).toEqual(subRunsInRect(s.points, rect, 3))
  })

  it('keeps a long crossing segment as a candidate', () => {
    const s = stroke([{ x: -1000, y: 0 }, ...Array.from({ length: 200 }, (_, i) => ({ x: 1000 + i, y: 1000 }))])
    const rect = normRect(-1, -1, 1, 1)
    expect(indexedSubRunsInRect(s, rect, 0)).toEqual(subRunsInRect(s.points, rect, 0))
  })
})
