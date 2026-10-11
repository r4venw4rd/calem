import type { Page, Stroke, Tool } from '../model/document'
import type { PersistedDoc } from '../lib/idb'
import { WIDTH_MAX, WIDTH_MIN } from '../config/tools'
import { pageFromRaw, cleanStrokes, singleLayerPage, type RawPage } from './pageSanitizer'
import { snapshotDoc } from './snapshot'

export interface BuildPersistedDocOptions {
  pages: Page[]
  widths: Record<Tool, number>
  activePageIndex: number
  pdfId?: string | null
  pdfName?: string
}

export const buildPersistedDoc = (options: BuildPersistedDocOptions): PersistedDoc => {
  const snap = snapshotDoc(options.pages, options.activePageIndex)
  return {
    v: 5,
    savedAt: Date.now(),
    pages: snap.pages,
    widths: { ...options.widths } as Record<Tool, number>,
    activePageIndex: options.activePageIndex,
    ...(options.pdfId ? { pdfId: options.pdfId, pdfName: options.pdfName ?? '' } : {}),
  }
}

export interface SavedSessionSummary {
  when: string
  pages: number
  strokes: number
}

export const summarizePersistedDoc = (
  doc: PersistedDoc | null,
  fmtTime: (t: number) => string,
): SavedSessionSummary | null => {
  if (!doc || typeof doc.v !== 'number') return null
  let pages = 0
  let strokes = 0
  if ((doc.v === 2 || doc.v === 3 || doc.v === 4 || doc.v === 5) && Array.isArray(doc.pages)) {
    pages = doc.pages.length
    for (const raw of doc.pages as unknown as RawPage[]) {
      if (!raw || typeof raw !== 'object') continue
      if (Array.isArray(raw.strokes)) strokes += raw.strokes.length
      if (Array.isArray(raw.texts)) strokes += raw.texts.length
      if (Array.isArray(raw.images)) strokes += raw.images.length
      if (Array.isArray(raw.layers)) {
        for (const l of raw.layers as { strokes?: unknown }[]) {
          if (l && Array.isArray(l.strokes)) strokes += l.strokes.length
        }
      }
    }
  } else if (doc.v === 1 && Array.isArray((doc as { strokes?: unknown }).strokes)) {
    pages = 1
    strokes = (doc as unknown as { strokes: unknown[] }).strokes.length
  }
  if (strokes === 0) return null
  return {
    when: fmtTime(typeof doc.savedAt === 'number' ? doc.savedAt : Date.now()),
    pages,
    strokes,
  }
}

export interface DeserializedDocResult {
  pages: Page[]
  widths?: Record<string, number>
  activePageIndex: number
  pdfId: string | null
  pdfName: string
  savedAt: number
}

export interface DeserializeDocOptions {
  doc: PersistedDoc
  viewFallback: { w: number; h: number }
  newPageId: () => string
}

export const deserializePersistedDoc = (options: DeserializeDocOptions): DeserializedDocResult | null => {
  const { doc, viewFallback, newPageId } = options
  if (!doc || typeof doc.v !== 'number') return null

  const widths: Record<string, number> = {}
  const rawWidths = (doc as { widths?: unknown }).widths as Record<string, unknown> | undefined
  if (rawWidths) {
    for (const t of ['pen', 'highlighter', 'eraser', 'line', 'rect', 'ellipse', 'arrow', 'text', 'image', 'hand'] as const) {
      const v = rawWidths[t]
      if (typeof v === 'number' && Number.isFinite(v)) {
        widths[t] = Math.min(WIDTH_MAX[t], Math.max(WIDTH_MIN[t], Math.round(v)))
      }
    }
  }

  let loaded: Page[] | null = null
  if ((doc.v === 2 || doc.v === 3 || doc.v === 4 || doc.v === 5) && Array.isArray(doc.pages)) {
    const clean = (doc.pages as unknown as RawPage[])
      .map((p) => pageFromRaw(p, viewFallback, newPageId))
      .filter((p): p is Page => p !== null)
    loaded = clean.length > 0 ? clean : null
  } else if (doc.v === 1 && Array.isArray((doc as { strokes?: unknown }).strokes)) {
    const v1 = (doc as unknown as { strokes: Stroke[] }).strokes
    const clean = cleanStrokes(v1)
    loaded = clean.length > 0 ? [singleLayerPage(newPageId(), clean, { ...viewFallback })] : null
  }

  if (!loaded || loaded.length === 0) return null

  const idx = (doc as { activePageIndex?: unknown }).activePageIndex
  const activePageIndex =
    typeof idx === 'number' && Number.isFinite(idx)
      ? Math.min(loaded.length - 1, Math.max(0, Math.floor(idx)))
      : 0

  const hasPdf = (doc.v === 2 || doc.v === 3 || doc.v === 4 || doc.v === 5) && Boolean(doc.pdfId)

  return {
    pages: loaded,
    widths: Object.keys(widths).length > 0 ? widths : undefined,
    activePageIndex,
    pdfId: hasPdf ? doc.pdfId ?? null : null,
    pdfName: hasPdf ? doc.pdfName ?? '' : '',
    savedAt: typeof doc.savedAt === 'number' ? doc.savedAt : Date.now(),
  }
}
