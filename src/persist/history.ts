import type { ImageItem, Page, Stroke, TextItem } from '../model/document'
import type { DocSnap } from './snapshot'

export type ErasePatch =
  | { collection: 'strokes'; layerId: string; index: number; removed: Stroke[]; inserted: Stroke[] }
  | { collection: 'texts'; index: number; removed: TextItem[]; inserted: TextItem[] }
  | { collection: 'images'; index: number; removed: ImageItem[]; inserted: ImageItem[] }

export type HistoryEntry =
  | { type: 'snapshot'; snapshot: DocSnap }
  | { type: 'stroke-add'; pageId: string; layerId: string; strokeId: string; index: number; stroke?: Stroke }
  | { type: 'erase'; pageId: string; patches: ErasePatch[] }

export const undoStrokeAdd = (pages: Page[], entry: Extract<HistoryEntry, { type: 'stroke-add' }>): Stroke | null => {
  const page = pages.find((p) => p.id === entry.pageId)
  const layer = page?.layers.find((l) => l.id === entry.layerId)
  const index = layer?.strokes.findIndex((s) => s.id === entry.strokeId) ?? -1
  if (!layer || index < 0) return null
  return layer.strokes.splice(index, 1)[0] ?? null
}

export const redoStrokeAdd = (pages: Page[], entry: Extract<HistoryEntry, { type: 'stroke-add' }>): boolean => {
  if (!entry.stroke || entry.stroke.id !== entry.strokeId) return false
  const page = pages.find((p) => p.id === entry.pageId)
  const layer = page?.layers.find((l) => l.id === entry.layerId)
  if (!layer || layer.strokes.some((s) => s.id === entry.strokeId)) return false
  layer.strokes.splice(Math.min(entry.index, layer.strokes.length), 0, entry.stroke)
  return true
}

const applyPatch = (page: Page, patch: ErasePatch, undo: boolean): boolean => {
  if (patch.collection === 'strokes') {
    const strokes = page.layers.find((layer) => layer.id === patch.layerId)?.strokes
    if (!strokes) return false
    const removed = undo ? patch.inserted : patch.removed
    const inserted = undo ? patch.removed : patch.inserted
    strokes.splice(patch.index, removed.length, ...inserted)
  } else if (patch.collection === 'texts') {
    const removed = undo ? patch.inserted : patch.removed
    const inserted = undo ? patch.removed : patch.inserted
    page.texts.splice(patch.index, removed.length, ...inserted)
  } else {
    const removed = undo ? patch.inserted : patch.removed
    const inserted = undo ? patch.removed : patch.inserted
    page.images.splice(patch.index, removed.length, ...inserted)
  }
  return true
}

export const undoErase = (pages: Page[], entry: Extract<HistoryEntry, { type: 'erase' }>): boolean => {
  const page = pages.find((p) => p.id === entry.pageId)
  if (!page) return false
  for (const patch of [...entry.patches].reverse()) {
    if (!applyPatch(page, patch, true)) return false
  }
  return true
}

export const redoErase = (pages: Page[], entry: Extract<HistoryEntry, { type: 'erase' }>): boolean => {
  const page = pages.find((p) => p.id === entry.pageId)
  if (!page) return false
  for (const patch of entry.patches) {
    if (!applyPatch(page, patch, false)) return false
  }
  return true
}
