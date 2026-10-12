import { describe, expect, it } from 'vitest'
import type { Page, Stroke } from '../src/model/document'
import { createPageSnapshotCache, restoreDocSnapshot } from '../src/persist/snapshot'

const makePage = (): Page => ({
  id: 'p',
  activeLayerId: 'l',
  size: { w: 100, h: 100 },
  texts: [],
  images: [],
  layers: [{ id: 'l', name: 'Layer', visible: true, strokes: [] }],
})

describe('createPageSnapshotCache', () => {
  it('reuses unchanged pages and keeps prior snapshots isolated after invalidation', () => {
    const page = makePage()
    const cache = createPageSnapshotCache()
    const first = cache.snapshot([page], 0)
    const same = cache.snapshot([page], 0)
    expect(same.pages[0]).toBe(first.pages[0])
    page.layers[0]!.strokes.push({
      id: 's',
      tool: 'pen',
      color: '#000',
      width: 2,
      dash: 'solid',
      opacity: 1,
      points: [{ x: 1, y: 2 }],
    } satisfies Stroke)
    cache.invalidate(page)
    const changed = cache.snapshot([page], 0)
    expect(changed.pages[0]).not.toBe(first.pages[0])
    expect(first.pages[0]!.layers[0]!.strokes).toHaveLength(0)
    expect(changed.pages[0]!.layers[0]!.strokes).toHaveLength(1)
  })

  it('restoring a shared history/persist snapshot never mutates the cached snapshot', () => {
    const page = makePage()
    const cache = createPageSnapshotCache()
    const snap = cache.snapshot([page], 0)
    const restored = restoreDocSnapshot(snap)
    restored.pages[0]!.layers[0]!.strokes.push({
      id: 's',
      tool: 'pen',
      color: '#000',
      width: 2,
      dash: 'solid',
      opacity: 1,
      points: [{ x: 1, y: 2 }],
    })
    expect(snap.pages[0]!.layers[0]!.strokes).toHaveLength(0)
    expect(cache.snapshot([page], 0).pages[0]).toBe(snap.pages[0])
  })
})
