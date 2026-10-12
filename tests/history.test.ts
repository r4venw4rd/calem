import { describe, expect, it } from 'vitest'
import type { Page, Stroke } from '../src/model/document'
import { redoErase, redoStrokeAdd, undoErase, undoStrokeAdd, type HistoryEntry } from '../src/persist/history'

const makePage = (): Page => ({
  id: 'p',
  activeLayerId: 'l',
  size: { w: 100, h: 100 },
  texts: [],
  images: [],
  layers: [{ id: 'l', name: 'Layer', visible: true, strokes: [] }],
})
const stroke = (id: string): Stroke => ({
  id,
  tool: 'pen',
  color: '#000',
  width: 2,
  dash: 'solid',
  opacity: 1,
  points: [{ x: 1, y: 2 }],
})

describe('stroke-add history delta', () => {
  it('undoes and redoes at the original layer position without copying other strokes', () => {
    const page = makePage()
    const before = stroke('before')
    const added = stroke('added')
    const after = stroke('after')
    page.layers[0]!.strokes.push(before, added, after)
    const undo: Extract<HistoryEntry, { type: 'stroke-add' }> = {
      type: 'stroke-add',
      pageId: 'p',
      layerId: 'l',
      strokeId: 'added',
      index: 1,
    }

    const removed = undoStrokeAdd([page], undo)
    expect(page.layers[0]!.strokes).toEqual([before, after])
    expect(redoStrokeAdd([page], { ...undo, stroke: removed ?? undefined })).toBe(true)
    expect(page.layers[0]!.strokes).toEqual([before, added, after])
  })

  it('leaves the document alone when the target stroke is missing', () => {
    const page = makePage()
    expect(
      undoStrokeAdd([page], {
        type: 'stroke-add',
        pageId: 'p',
        layerId: 'l',
        strokeId: 'missing',
        index: 0,
      }),
    ).toBeNull()
    expect(page.layers[0]!.strokes).toEqual([])
  })

  it('reverses mixed eraser removals and splits in the correct order', () => {
    const page = makePage()
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(stroke)
    const b1 = stroke('b1')
    const b2 = stroke('b2')
    page.layers[0]!.strokes.push(b1, b2, c!)
    const entry: Extract<HistoryEntry, { type: 'erase' }> = {
      type: 'erase',
      pageId: 'p',
      patches: [
        { collection: 'strokes', layerId: 'l', index: 3, removed: [d!], inserted: [] },
        { collection: 'strokes', layerId: 'l', index: 1, removed: [b!], inserted: [b1, b2] },
        { collection: 'strokes', layerId: 'l', index: 0, removed: [a!], inserted: [] },
      ],
    }
    expect(undoErase([page], entry)).toBe(true)
    expect(page.layers[0]!.strokes).toEqual([a, b, c, d])
    expect(redoErase([page], entry)).toBe(true)
    expect(page.layers[0]!.strokes).toEqual([b1, b2, c])
  })
})
