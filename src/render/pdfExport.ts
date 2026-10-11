// Vektör PDF export (Faz 8): mürekkep, desenler ve metinler PDF çizim komutlarına dönüştürülür.
import type { jsPDF } from 'jspdf'
import type { Page, Stroke } from '../model/document'
import type { PaperBackground } from '../lib/paper'
import { isShapeTool } from '../model/document'
import { shapeEndpoints } from '../lib/geometry'
import { wrapTextToWidth } from '../lib/text'
import { dashFor, effectiveWidth } from './strokes'
import {
  cornellLayout,
  dottedPoints,
  graphLineXs,
  isometricLines,
  marginLineX,
  plannerLayout,
  ruledLineYs,
  staffLineYs,
} from '../lib/paper'

export type PdfDoc = InstanceType<typeof jsPDF>

export const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  if (Number.isNaN(n)) return [255, 255, 0]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export const paintStrokeVector = (
  doc: PdfDoc,
  GState: new (p: { opacity?: number }) => unknown,
  s: Stroke,
  paperHex: string | null,
  pressureSensitivity: number,
) => {
  if (s.points.length === 0) return
  const w = s.tool === 'eraser' ? s.width : effectiveWidth(s.points, s.width, pressureSensitivity)
  doc.saveGraphicsState()
  try {
    if (s.tool === 'eraser') {
      const [r, g, b] = hexToRgb(paperHex ?? '#ffffff')
      doc.setDrawColor(r, g, b)
      doc.setFillColor(r, g, b)
      doc.setLineWidth(Math.max(w, 5))
    } else if (s.tool === 'highlighter') {
      const [r, g, b] = hexToRgb(s.color)
      doc.setDrawColor(r, g, b)
      doc.setFillColor(r, g, b)
      doc.setLineWidth(Math.max(w * 2.5, 8))
      doc.setGState(new GState({ opacity: 0.5 }) as never)
    } else {
      const [r, g, b] = hexToRgb(s.color)
      doc.setDrawColor(r, g, b)
      doc.setFillColor(r, g, b)
      doc.setLineWidth(Math.max(w, 1))
      if (s.opacity < 1) doc.setGState(new GState({ opacity: s.opacity }) as never)
    }
    doc.setLineCap('round')
    doc.setLineJoin('round')
    const dash = dashFor(s.tool, s.dash, w)
    if (dash.length > 0) doc.setLineDashPattern(dash, 0)
    if (isShapeTool(s.tool)) {
      const ends = shapeEndpoints(s.points)
      if (!ends || (ends[0].x === ends[1].x && ends[0].y === ends[1].y)) {
        const p = s.points[0]!
        doc.circle(p.x, p.y, Math.max(w / 2, 1), 'F')
        return
      }
      const [a, b] = ends
      if (s.tool === 'line' || s.tool === 'arrow') {
        doc.moveTo(a.x, a.y)
        doc.lineTo(b.x, b.y)
        if (s.tool === 'arrow') {
          const ang = Math.atan2(b.y - a.y, b.x - a.x)
          const len = Math.max(8, doc.getLineWidth() * 4)
          const spread = Math.PI / 7
          for (const d of [-1, 1]) {
            doc.moveTo(b.x, b.y)
            doc.lineTo(b.x - len * Math.cos(ang + d * spread), b.y - len * Math.sin(ang + d * spread))
          }
        }
        doc.stroke()
        return
      }
      if (s.tool === 'rect') {
        doc.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
        return
      }
      doc.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2)
      return
    }
    if (s.points.length === 1) {
      const p = s.points[0]!
      doc.circle(p.x, p.y, Math.max(w / 2, 1), 'F')
      return
    }
    const p0 = s.points[0]!
    doc.moveTo(p0.x, p0.y)
    for (const p of s.points.slice(1)) doc.lineTo(p.x, p.y)
    doc.stroke()
  } finally {
    doc.restoreGraphicsState()
  }
}

export const paintStrokesVector = (
  doc: PdfDoc,
  GState: new (p: { opacity?: number }) => unknown,
  page: Page,
  paperHex: string | null,
  pressureSensitivity: number,
) => {
  for (const layer of page.layers) {
    if (!layer.visible) continue
    for (const s of layer.strokes) paintStrokeVector(doc, GState, s, paperHex, pressureSensitivity)
  }
}

export const paintPatternVector = (
  doc: PdfDoc,
  page: Page,
  bg: PaperBackground,
  hasBgCanvas: boolean,
) => {
  if (bg.type === 'blank' && !bg.margin) return
  if (hasBgCanvas) return
  const { w, h } = page.size
  const [r, g, b] = hexToRgb(bg.lineColor)
  doc.saveGraphicsState()
  try {
    doc.setDrawColor(r, g, b)
    doc.setFillColor(r, g, b)
    if (bg.type === 'ruled') {
      ruledLineYs(h, bg.spacing).forEach((y, i) => {
        doc.setLineWidth(i % 5 === 4 ? 1.2 : 0.7)
        doc.line(0, y, w, y)
      })
    } else if (bg.type === 'graph') {
      ruledLineYs(h, bg.spacing).forEach((y, i) => {
        doc.setLineWidth(i % 5 === 4 ? 1 : 0.5)
        doc.line(0, y, w, y)
      })
      graphLineXs(w, bg.spacing).forEach((x, i) => {
        doc.setLineWidth(i % 5 === 4 ? 1 : 0.5)
        doc.line(x, 0, x, h)
      })
    } else if (bg.type === 'dotted') {
      for (const p of dottedPoints(w, h, bg.spacing)) doc.circle(p.x, p.y, 1.3, 'F')
    } else if (bg.type === 'staff') {
      doc.setLineWidth(0.9)
      for (const group of staffLineYs(h, bg.spacing)) {
        for (const y of group) doc.line(0, y, w, y)
      }
    } else if (bg.type === 'isometric') {
      doc.setLineWidth(0.5)
      for (const line of isometricLines(w, h, bg.spacing)) {
        doc.line(line.x1, line.y1, line.x2, line.y2)
      }
    } else if (bg.type === 'cornell') {
      const cl = cornellLayout(w, h, bg.spacing)
      if (cl) {
        doc.setLineWidth(1.2)
        doc.line(0, cl.headerY, w, cl.headerY)
        doc.line(cl.cueX, cl.headerY, cl.cueX, cl.summaryY)
        doc.line(0, cl.summaryY, w, cl.summaryY)

        doc.setLineWidth(0.6)
        for (const r of cl.ruledLines) {
          doc.line(r.x1, r.y, r.x2, r.y)
        }
      }
    } else if (bg.type === 'planner') {
      const pl = plannerLayout(w, h, bg.spacing)
      if (pl) {
        doc.setLineWidth(1.2)
        doc.line(0, pl.headerY, w, pl.headerY)
        if (pl.sideColX !== null) {
          doc.line(pl.sideColX, pl.headerY, pl.sideColX, h)
        }

        for (let i = 0; i < pl.ruledLines.length; i++) {
          const y = pl.ruledLines[i]
          const boxX = pl.checkboxXs[i]
          if (y === undefined || boxX === undefined) continue
          doc.setLineWidth(0.6)
          doc.line(0, y, w, y)

          const boxSize = Math.min(10, Math.max(6, Math.round(bg.spacing * 0.45)))
          const boxY = y - boxSize - 3
          if (boxY > pl.headerY) {
            doc.setLineWidth(0.9)
            doc.rect(boxX, boxY, boxSize, boxSize)
          }
        }
      }
    }
    if (bg.margin) {
      const mx = marginLineX(w)
      if (mx !== null) {
        const [mr, mg, mb] = hexToRgb(bg.marginColor)
        doc.setDrawColor(mr, mg, mb)
        doc.setLineWidth(1.2)
        doc.line(mx, 0, mx, h)
      }
    }
  } finally {
    doc.restoreGraphicsState()
  }
}

export const paintTextsVector = (doc: PdfDoc, page: Page) => {
  if (!page.texts || page.texts.length === 0) return
  for (const t of page.texts) {
    if (!t.text) continue
    const [r, g, b] = hexToRgb(t.color)
    doc.setTextColor(r, g, b)
    doc.setFontSize(t.size)
    doc.text(wrapTextToWidth(t.text, t.w ?? 0, t.size), t.x, t.y, {
      baseline: 'top',
      lineHeightFactor: 1.25,
    })
  }
}
