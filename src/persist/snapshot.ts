// Anlık görüntü: reactive proxy'leri düz veriye çevir —
// IDB structured-clone'a ve history stack'ine temiz girer. Saf, store bağımsız.

import type { ImageItem, Layer, Page, Stroke, TextItem } from '../model/document'

// Stroke kimliği: seçim/taşıma/kopyala'nın zemini. Sayfa id'sinden bağımsız sayaçlı.
let strokeSeq = 0
export const newStrokeId = () =>
  `s-${Date.now().toString(36)}-${(strokeSeq++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`

export const newPageId = () =>
  `p-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`

export const newLayerId = () =>
  `l-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`

export const newTextId = () =>
  `t-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`

export const snapshotStroke = (s: Stroke): Stroke => ({
  id: typeof s.id === 'string' && s.id ? s.id : newStrokeId(),
  tool: s.tool,
  color: s.color,
  width: s.width,
  dash: s.dash,
  opacity: s.opacity,
  points: s.points.map((p) => ({ x: p.x, y: p.y, pressure: p.pressure })),
})

export const snapshotText = (t: TextItem): TextItem => ({
  id: t.id,
  x: t.x,
  y: t.y,
  text: t.text,
  color: t.color,
  size: t.size,
  ...(t.w !== undefined ? { w: t.w } : {}),
})

export const snapshotImage = (t: ImageItem): ImageItem => ({
  id: t.id,
  x: t.x,
  y: t.y,
  w: t.w,
  h: t.h,
  fileId: t.fileId,
})

export const snapshotLayer = (l: Layer): Layer => ({
  id: l.id,
  name: l.name,
  visible: l.visible,
  strokes: l.strokes.map(snapshotStroke),
})

export interface DocSnap {
  pages: Page[]
  activePageIndex: number
}

export const snapshotDoc = (pages: Page[], activePageIndex: number): DocSnap => ({
  pages: pages.map((p) => ({
    id: p.id,
    layers: p.layers.map(snapshotLayer),
    activeLayerId: p.activeLayerId,
    texts: p.texts.map(snapshotText),
    images: p.images.map(snapshotImage),
    size: { w: p.size.w, h: p.size.h },
    ...(p.pdfPageIndex !== undefined ? { pdfPageIndex: p.pdfPageIndex } : {}),
  })),
  activePageIndex,
})

export const restoreDocSnapshot = (s: DocSnap): { pages: Page[]; activePageIndex: number } => ({
  pages: s.pages.map((p) => ({
    id: p.id,
    layers: p.layers.map((l) => ({
      id: l.id,
      name: l.name,
      visible: l.visible,
      strokes: l.strokes.map(snapshotStroke),
    })),
    activeLayerId: p.activeLayerId,
    texts: p.texts.map(snapshotText),
    images: p.images.map(snapshotImage),
    size: { w: p.size.w, h: p.size.h },
    ...(p.pdfPageIndex !== undefined ? { pdfPageIndex: p.pdfPageIndex } : {}),
  })),
  activePageIndex: Math.min(s.activePageIndex, Math.max(0, s.pages.length - 1)),
})
