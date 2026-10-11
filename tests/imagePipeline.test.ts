import { describe, expect, it } from 'vitest'
import { deleteImageFilesOf } from '../src/lib/imagePipeline'
import type { Page } from '../src/model/document'
import type { DocStorage } from '../src/lib/idb'

describe('deleteImageFilesOf', () => {
  it('preserves file ids reused by the replacement document', async () => {
    const deleted: string[] = []
    const storage = { deleteFile: async (id: string) => { deleted.push(id) } } as DocStorage
    const image = (fileId: string) => ({ id: fileId, layerId: 'layer', x: 0, y: 0, w: 20, h: 20, fileId })
    const page = (id: string, fileId: string): Page => ({
      id, size: { w: 100, h: 100 }, layers: [], activeLayerId: '', texts: [], images: [image(fileId)],
    })
    const bitmaps = new Map<string, HTMLCanvasElement>([
      ['shared', {} as HTMLCanvasElement], ['old', {} as HTMLCanvasElement],
    ])

    deleteImageFilesOf([page('old-page', 'shared'), page('old-page-2', 'old')], bitmaps, storage, new Set(['shared']))
    await Promise.resolve()

    expect(deleted).toEqual(['old'])
    expect(bitmaps.has('shared')).toBe(true)
    expect(bitmaps.has('old')).toBe(false)
  })
})
