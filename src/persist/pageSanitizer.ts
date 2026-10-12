import { isShapeTool, TEXT_SIZE_MAX, TEXT_SIZE_MIN } from '../model/document'
import { newStrokeId } from './snapshot'
import type { ImageItem, Layer, Page, Stroke, TextItem } from '../model/document'

export interface RawPage {
  id?: unknown
  strokes?: unknown
  layers?: unknown
  activeLayerId?: unknown
  texts?: unknown
  images?: unknown
  size?: unknown
  bgSize?: unknown
  pdfPageIndex?: unknown
}

export const cleanStrokes = (input: unknown): Stroke[] => {
  if (!Array.isArray(input)) return []
  const clean: Stroke[] = []
  for (const s of input) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.points)) continue
    const pts = s.points.filter((p: unknown) => {
      const pt = p as { x?: unknown; y?: unknown }
      return (
        pt && typeof pt.x === 'number' && Number.isFinite(pt.x) && typeof pt.y === 'number' && Number.isFinite(pt.y)
      )
    })
    if (pts.length === 0) continue
    clean.push({
      id: typeof (s as Stroke).id === 'string' && (s as Stroke).id ? (s as Stroke).id : newStrokeId(),
      tool: s.tool === 'eraser' || s.tool === 'highlighter' || isShapeTool(s.tool) ? s.tool : 'pen',
      color: typeof s.color === 'string' ? s.color : '#ffffff',
      width: typeof s.width === 'number' && Number.isFinite(s.width) ? Math.min(120, Math.max(1, s.width)) : 3,
      dash: (s as Stroke).dash === 'dash' || (s as Stroke).dash === 'dot' ? (s as Stroke).dash : 'solid',
      opacity:
        typeof (s as Stroke).opacity === 'number' && Number.isFinite((s as Stroke).opacity)
          ? Math.min(1, Math.max(0.1, (s as Stroke).opacity))
          : 1,
      points: pts.map((p: { x: number; y: number; pressure?: number }) => ({
        x: p.x,
        y: p.y,
        pressure:
          typeof p.pressure === 'number' && Number.isFinite(p.pressure) ? Math.min(1, Math.max(0, p.pressure)) : 0.5,
      })),
    })
  }
  return clean
}

export const cleanTexts = (input: unknown): TextItem[] => {
  if (!Array.isArray(input)) return []
  const clean: TextItem[] = []
  for (const t of input) {
    if (!t || typeof t !== 'object') continue
    const r = t as Record<string, unknown>
    if (typeof r.text !== 'string' || r.text === '') continue
    if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) continue
    clean.push({
      id: typeof r.id === 'string' && r.id ? r.id : newStrokeId(),
      x: r.x as number,
      y: r.y as number,
      text: (r.text as string).slice(0, 2000),
      color: typeof r.color === 'string' ? r.color : '#ffffff',
      size:
        typeof r.size === 'number' && Number.isFinite(r.size)
          ? Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, Math.round(r.size)))
          : 24,
      ...(typeof r.w === 'number' && Number.isFinite(r.w) && r.w >= 40 ? { w: Math.round(r.w) } : {}),
    })
  }
  return clean
}

export const cleanImages = (input: unknown, layerIds: Set<string>, fallbackLayerId: string): ImageItem[] => {
  if (!Array.isArray(input)) return []
  const clean: ImageItem[] = []
  for (const t of input) {
    if (!t || typeof t !== 'object') continue
    const r = t as Record<string, unknown>
    if (typeof r.fileId !== 'string' || !r.fileId) continue
    if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) continue
    if (!Number.isFinite(r.w) || !Number.isFinite(r.h)) continue
    const w = Math.round(r.w as number)
    const h = Math.round(r.h as number)
    if (w < 16 || h < 16 || w > 3000 || h > 3000) continue
    clean.push({
      id: typeof r.id === 'string' && r.id ? r.id : newStrokeId(),
      layerId: typeof r.layerId === 'string' && layerIds.has(r.layerId) ? r.layerId : fallbackLayerId,
      x: r.x as number,
      y: r.y as number,
      w,
      h,
      fileId: r.fileId,
    })
  }
  return clean
}

export const cleanLayers = (input: unknown): Layer[] => {
  if (!Array.isArray(input)) return []
  const out: Layer[] = []
  for (const l of input) {
    if (!l || typeof l !== 'object') continue
    const r = l as Record<string, unknown>
    if (!Array.isArray(r.strokes)) continue
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : newStrokeId(),
      name: typeof r.name === 'string' && r.name ? r.name.slice(0, 40) : `Katman ${out.length + 1}`,
      visible: r.visible !== false,
      strokes: cleanStrokes(r.strokes),
    })
  }
  return out
}

export const pageSizeOf = (
  raw: { size?: unknown; bgSize?: unknown },
  fallback: { w: number; h: number },
): { w: number; h: number } => {
  const s = raw.size as { w?: unknown; h?: unknown } | undefined
  if (
    s &&
    typeof s.w === 'number' &&
    Number.isFinite(s.w) &&
    typeof s.h === 'number' &&
    Number.isFinite(s.h) &&
    s.w > 0 &&
    s.h > 0
  ) {
    return { w: s.w, h: s.h }
  }
  const b = raw.bgSize as { w?: unknown; h?: unknown } | undefined
  if (
    b &&
    typeof b.w === 'number' &&
    Number.isFinite(b.w) &&
    typeof b.h === 'number' &&
    Number.isFinite(b.h) &&
    b.w > 0 &&
    b.h > 0
  ) {
    return { w: b.w, h: b.h }
  }
  return { ...fallback }
}

export const pageFromRaw = (
  p: RawPage,
  fallback: { w: number; h: number },
  generatePageId: () => string = newStrokeId,
): Page | null => {
  if (!p || typeof p !== 'object') return null
  const layers = cleanLayers(p.layers)
  if (layers.length === 0 && Array.isArray(p.strokes)) {
    layers.push({
      id: newStrokeId(),
      name: 'Katman 1',
      visible: true,
      strokes: cleanStrokes(p.strokes),
    })
  }
  if (layers.length === 0) {
    layers.push({ id: newStrokeId(), name: 'Katman 1', visible: true, strokes: [] })
  }
  const activeLayerId =
    typeof p.activeLayerId === 'string' && layers.some((l) => l.id === p.activeLayerId)
      ? p.activeLayerId
      : layers[0]!.id
  return {
    id: typeof p.id === 'string' && p.id ? p.id : generatePageId(),
    layers,
    activeLayerId,
    texts: cleanTexts(p.texts),
    images: cleanImages(p.images, new Set(layers.map((l) => l.id)), layers[0]!.id),
    size: pageSizeOf(p, fallback),
    pdfPageIndex:
      typeof p.pdfPageIndex === 'number' && Number.isFinite(p.pdfPageIndex) ? Math.floor(p.pdfPageIndex) : undefined,
  }
}

export const singleLayerPage = (
  id: string,
  strokes: Stroke[],
  size: { w: number; h: number },
  layerId: string = newStrokeId(),
): Page => ({
  id,
  layers: [{ id: layerId, name: 'Katman 1', visible: true, strokes }],
  activeLayerId: layerId,
  texts: [],
  images: [],
  size,
})
