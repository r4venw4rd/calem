import { describe, expect, it } from 'vitest'
import { buildPersistedDoc, deserializePersistedDoc, summarizePersistedDoc } from '../src/persist/docPersistence'
import type { PersistedDoc } from '../src/lib/idb'
import type { Page, Stroke, Tool } from '../src/model/document'
import { snapshotDoc } from '../src/persist/snapshot'

describe('document persistence', () => {
  const page = (): Page => ({
    id: 'p', activeLayerId: 'l', size: { w: 100, h: 100 }, texts: [], images: [],
    layers: [{ id: 'l', name: 'Layer', visible: true, strokes: [] }],
  })

  it('uses the cached snapshot passed by autosave without copying it again', () => {
    const source = page()
    const snapshot = snapshotDoc([source], 0)
    const doc = buildPersistedDoc({
      pages: [source], widths: {} as Record<Tool, number>, activePageIndex: 0, snapshot,
    })
    expect(doc.pages).toBe(snapshot.pages)
  })

  it('continues to snapshot input pages when no cached snapshot is supplied', () => {
    const source = page()
    const doc = buildPersistedDoc({
      pages: [source], widths: {} as Record<Tool, number>, activePageIndex: 0,
    })
    expect(doc.pages[0]).not.toBe(source)
  })

  it('migrates a v1 stroke document into one page and one layer without losing ink', () => {
    const result = deserializePersistedDoc({
      doc: {
        v: 1,
        savedAt: 12,
        strokes: [{
          id: 's1', tool: 'pen', color: '#fff', width: 3, dash: 'solid', opacity: 1,
          points: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
        }],
      } as PersistedDoc,
      viewFallback: { w: 600, h: 800 },
      newPageId: () => 'migrated-page',
    })

    expect(result?.pages).toHaveLength(1)
    expect(result?.pages[0]?.id).toBe('migrated-page')
    expect(result?.pages[0]?.layers[0]?.strokes[0]?.points).toEqual([
      { x: 10, y: 20, pressure: 0.5 },
      { x: 30, y: 40, pressure: 0.5 },
    ])
    expect(result?.pages[0]?.size).toEqual({ w: 600, h: 800 })
  })

  it('clamps the active page and restores the PDF reference from a v5 document', () => {
    const result = deserializePersistedDoc({
      doc: {
        v: 5, savedAt: 12, pages: [{
          id: 'p1', layers: [{ id: 'l1', name: 'Ink', visible: true, strokes: [] }],
          activeLayerId: 'l1', texts: [], images: [], size: { w: 600, h: 800 },
        }],
        activePageIndex: 10, pdfId: 'pdf-1', pdfName: 'notes.pdf',
      } as PersistedDoc,
      viewFallback: { w: 500, h: 700 },
      newPageId: () => 'unused',
    })

    expect(result?.activePageIndex).toBe(0)
    expect(result?.pdfId).toBe('pdf-1')
    expect(result?.pdfName).toBe('notes.pdf')
  })

  it('shows a saved-session banner only for documents containing content', () => {
    const fmt = (time: number) => String(time)
    expect(summarizePersistedDoc({ v: 1, savedAt: 7, strokes: [] }, fmt)).toBeNull()
    expect(summarizePersistedDoc({ v: 1, savedAt: 7, strokes: [{} as Stroke] }, fmt)).toEqual({
      when: '7', pages: 1, strokes: 1,
    })
  })
})
