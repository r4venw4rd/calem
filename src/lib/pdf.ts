// PDF import and rasterization helpers using pdfjs-dist.
// Dinamik import edilir: ilk sayfa yüklemesine bundle ağırlığı eklenmez.
import {
  PDF_MANY_THRESHOLD,
  PDF_RENDER_BASE,
  PDF_RENDER_MANY,
} from '../config/engine'

let workerReady = false

export interface RenderedPdfPage {
  canvas: HTMLCanvasElement
  cssW: number
  cssH: number
}

export const ensurePdfWorker = async () => {
  const pdfjs = await import('pdfjs-dist')
  if (!workerReady) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).href
    workerReady = true
  }
  return pdfjs
}

export const renderPdfPages = async (
  bytes: Uint8Array,
): Promise<{ rendered: RenderedPdfPage[]; scale: number }> => {
  const pdfjs = await ensurePdfWorker()
  const pdf = await pdfjs.getDocument({ data: bytes }).promise
  try {
    const scale = pdf.numPages > PDF_MANY_THRESHOLD ? PDF_RENDER_MANY : PDF_RENDER_BASE
    const out: RenderedPdfPage[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      out.push({ canvas, cssW: viewport.width / scale, cssH: viewport.height / scale })
    }
    return { rendered: out, scale }
  } finally {
    await pdf.cleanup()
  }
}

export const renderPdfPageAt = async (
  bytes: Uint8Array,
  index0: number,
  scale: number,
): Promise<RenderedPdfPage | null> => {
  const pdfjs = await ensurePdfWorker()
  const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise
  try {
    if (index0 < 0 || index0 >= pdf.numPages) return null
    const page = await pdf.getPage(index0 + 1)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    return { canvas, cssW: viewport.width / scale, cssH: viewport.height / scale }
  } finally {
    await pdf.cleanup()
  }
}
