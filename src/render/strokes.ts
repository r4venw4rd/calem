// Vuruş boyama: canvas 2D path + stil. Saf çizim, store bağımsız —
// hassasiyet gibi state parametreyle girer, içeriden ref okunmaz.

import type { DashStyle, Point, ShapeTool, Stroke, Tool } from '../model/document'
import { isShapeTool as isShapeToolLocal } from '../model/document'
import { shapeEndpoints as shapeEndpointsLocal } from '../lib/geometry'

export const hexToRgba = (hex: string, alpha: number): string => {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  if (Number.isNaN(n)) return `rgba(255,255,0,${alpha})`
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r},${g},${b},${alpha})`
}

export const applyStyleForStroke = (
  ctx: CanvasRenderingContext2D,
  tool: Tool,
  col: string,
  w: number,
  paperHex: string | null,
  opacity = 1,
) => {
  if (tool === 'eraser') {
    // LEGACY: eski kayıtlardaki boya-silgi replay'i. Yeni silgi keser, boyamaz —
    // bu dala yeni history düşmez (stopDrawing silgiye nokta kurmaz).
    if (paperHex) {
      // Kâğıt modu: silgi = kâğıt rengi boya (opak base, seam yok, undo tutarlı).
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = paperHex
      ctx.lineWidth = Math.max(w, 5)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.globalAlpha = 1
    } else {
      // Şeffaf mod (PDF): gerçek silme.
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0, 0, 0, 1)'
      ctx.lineWidth = Math.max(w, 5)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.globalAlpha = 1
    }
  } else if (tool === 'highlighter') {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = hexToRgba(col, 0.5)
    ctx.lineWidth = Math.max(w * 2.5, 8)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.globalAlpha = 0.5
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = col
    ctx.lineWidth = Math.max(w, 1)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.globalAlpha = 0.95 * opacity
  }
}

// Kesikli desen (kalem + şekiller; vurgu/silgi düz). Genişliğe oranlı tireler.
export const dashFor = (tool: Tool, dash: DashStyle, w: number): number[] => {
  if (dash === 'solid') return []
  if (tool === 'highlighter' || tool === 'eraser' || tool === 'select' || tool === 'text' || tool === 'image' || tool === 'hand') return []
  if (dash === 'dash') return [Math.max(5, w * 3), Math.max(3, w * 1.8)]
  return [0.5, Math.max(2.5, w * 1.5)]
}

// ✅ Catmull-Rom spline ile smooth path (verilen noktalar için)
export const strokePath = (ctx: CanvasRenderingContext2D, pts: Point[]) => {
  if (pts.length === 1) {
    const p = pts[0]!
    // Tek nokta = nokta koy (tıklayıp bırakma durumu)
    ctx.beginPath()
    ctx.arc(p.x, p.y, 0.1, 0, Math.PI * 2)
    // arc tek başına stroke ile görünmez olabilir, o yüzden lineTo trick:
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(p.x + 0.1, p.y + 0.1)
    return
  }
  if (pts.length < 2) return

  ctx.beginPath()
  const p0 = pts[0]!
  ctx.moveTo(p0.x, p0.y)

  for (let i = 0; i < pts.length - 1; i++) {
    const p0ref = i > 0 ? pts[i - 1]! : pts[i]!
    const p1 = pts[i]!
    const p2 = pts[i + 1]!
    const p3 = pts[i + 2] || p2

    const tension = 0.5
    const cp1x = p1.x + ((p2.x - p0ref.x) / 6) * tension
    const cp1y = p1.y + ((p2.y - p0ref.y) / 6) * tension
    const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y)
  }
}

// Basınç ortalamasından efektif genişlik: sensitivity=0 → basınç yok sayılır.
export const effectiveWidth = (pts: Point[], base: number, sensitivity: number): number => {
  if (sensitivity <= 0 || pts.length === 0) return base
  let sum = 0
  for (const p of pts) sum += p.pressure ?? 1
  const avg = sum / pts.length
  const pressureFactor = 0.4 + 0.6 * Math.min(Math.max(avg, 0), 1)
  const w = base * (1 + (pressureFactor - 1) * Math.min(sensitivity, 2))
  return Math.max(w, 0.5)
}

// Primitif path kurar (stroke çağrılmaz — stiller üstte hazırdır).
export const paintShape = (ctx: CanvasRenderingContext2D, tool: ShapeTool, a: Point, b: Point) => {
  if (tool === 'line' || tool === 'arrow') {
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    if (tool === 'arrow') {
      const ang = Math.atan2(b.y - a.y, b.x - a.x)
      const len = Math.max(8, ctx.lineWidth * 4)
      const spread = Math.PI / 7
      for (const d of [-1, 1] as const) {
        ctx.moveTo(b.x, b.y)
        ctx.lineTo(b.x - len * Math.cos(ang + d * spread), b.y - len * Math.sin(ang + d * spread))
      }
    }
    return
  }
  if (tool === 'rect') {
    ctx.beginPath()
    ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
    return
  }
  // ellipse: köşegenin tanımladığı kutuya iç teğet elips.
  ctx.beginPath()
  ctx.ellipse(
    (a.x + b.x) / 2,
    (a.y + b.y) / 2,
    Math.abs(b.x - a.x) / 2,
    Math.abs(b.y - a.y) / 2,
    0,
    0,
    Math.PI * 2,
  )
}

export const paintStroke = (
  ctx: CanvasRenderingContext2D,
  s: Pick<Stroke, 'tool' | 'color' | 'width' | 'dash' | 'opacity' | 'points'>,
  paperHex: string | null,
  sensitivity: number,
) => {
  if (s.points.length === 0) return
  ctx.save()
  const w = s.tool === 'eraser' ? s.width : effectiveWidth(s.points, s.width, sensitivity)
  applyStyleForStroke(ctx, s.tool, s.color, w, paperHex, s.opacity)
  ctx.setLineDash(dashFor(s.tool, s.dash, w))
  // Dejenere şekil (tek nokta / sıfır boy) nokta olarak düşer.
  let dotted = false
  if (isShapeToolLocal(s.tool)) {
    const ends = shapeEndpointsLocal(s.points)
    if (ends && (ends[0].x !== ends[1].x || ends[0].y !== ends[1].y)) {
      paintShape(ctx, s.tool, ends[0], ends[1])
      ctx.stroke()
    } else {
      dotted = true
    }
  } else {
    strokePath(ctx, s.points)
    ctx.stroke()
    // Tek nokta ise dolgu da yap ki görünsün
    dotted = s.points.length === 1
  }
  if (dotted) {
    const p = s.points[0]!
    ctx.beginPath()
    ctx.arc(p.x, p.y, Math.max(w / 2, 1), 0, Math.PI * 2)
    if (s.tool === 'eraser') {
      if (paperHex) {
        ctx.globalCompositeOperation = 'source-over'
        ctx.fillStyle = paperHex
      } else {
        ctx.globalCompositeOperation = 'destination-out'
        ctx.fillStyle = 'rgba(0,0,0,1)'
      }
    } else {
      ctx.fillStyle = s.tool === 'highlighter' ? hexToRgba(s.color, 0.5) : s.color
    }
    ctx.fill()
  }
  ctx.restore()
}
