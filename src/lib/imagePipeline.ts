import type { Page } from '../model/document'
import type { DocStorage } from './idb'
import { IMAGE_MAX_DIM } from '../config/engine'
import type { HistoryEntry } from '../persist/history'

export const isImageFile = (file: File): boolean => {
  return file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name)
}

export const bytesToCanvas = async (bytes: ArrayBuffer, maxDim = IMAGE_MAX_DIM): Promise<HTMLCanvasElement | null> => {
  try {
    const bmp = await createImageBitmap(new Blob([bytes]))
    try {
      const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height))
      const w = Math.max(1, Math.round(bmp.width * scale))
      const h = Math.max(1, Math.round(bmp.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(bmp, 0, 0, w, h)
      return canvas
    } finally {
      bmp.close()
    }
  } catch {
    return null
  }
}

export const fitImageDimensions = (canvasW: number, canvasH: number, maxW: number): { w: number; h: number } => {
  let w = canvasW
  let h = canvasH
  if (w > maxW) {
    h = Math.max(16, Math.round((h * maxW) / w))
    w = maxW
  }
  return { w, h }
}

export const placeImageInBounds = (
  x: number,
  y: number,
  w: number,
  h: number,
  pageSize: { w: number; h: number },
): { x: number; y: number } => {
  return {
    x: Math.min(pageSize.w - 8, Math.max(-w + 8, Math.round(x - w / 2))),
    y: Math.min(pageSize.h - 8, Math.max(-h + 8, Math.round(y - h / 2))),
  }
}

export const restoreBitmapsFromStorage = async (
  pages: Page[],
  bitmaps: Map<string, HTMLCanvasElement>,
  storage: DocStorage,
): Promise<void> => {
  try {
    const ids = new Set<string>()
    for (const p of pages) {
      for (const img of p.images ?? []) ids.add(img.fileId)
    }
    for (const fid of ids) {
      if (bitmaps.has(fid)) continue
      const rec = await storage.getImage(fid)
      if (!rec) continue
      const canvas = await bytesToCanvas(rec.bytes)
      if (canvas) bitmaps.set(fid, canvas)
    }
  } catch {
    /* resimsiz devam */
  }
}

export const collectReferencedImageFileIds = (
  pages: Page[],
  undoStack: HistoryEntry[],
  redoStack: HistoryEntry[],
): Set<string> => {
  const ids = new Set<string>()
  const add = (list: Page[]) => {
    for (const p of list) for (const img of p.images ?? []) ids.add(img.fileId)
  }
  add(pages)
  for (const entry of [...undoStack, ...redoStack]) {
    if (entry.type === 'snapshot') add(entry.snapshot.pages)
    else if (entry.type === 'erase') {
      for (const patch of entry.patches) {
        if (patch.collection === 'images') for (const img of [...patch.removed, ...patch.inserted]) ids.add(img.fileId)
      }
    }
  }
  return ids
}

export const deleteImageFilesOf = (
  pages: Page[],
  bitmaps: Map<string, HTMLCanvasElement>,
  storage: DocStorage,
  keepIds: Set<string> = new Set(),
): void => {
  const ids = new Set(pages.flatMap((p) => (p.images ?? []).map((img) => img.fileId)))
  for (const id of ids) {
    if (keepIds.has(id)) continue
    bitmaps.delete(id)
    void storage.deleteFile(id).catch(() => {})
  }
}
