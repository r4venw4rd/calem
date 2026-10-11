// Saf şekil tanıma motoru: serbest çizim noktalarını primitiflere (çizgi, dikdörtgen, elips/daire)
// dönüştürür. Bağımsız, render/store bağımsız, 100% unit-tested.

import type { Point, ShapeTool } from '../model/document'

export interface RecognizedShape {
  tool: ShapeTool
  points: [Point, Point]
  confidence: number
}

export interface ShapeRecognitionOptions {
  /** Çizgileri yatay/dikey eksene otomatik kilitler (açı farkı < 7 derece). */
  snapAngles?: boolean
  /** Daireye yakın elipsleri mükemmel daireye yuvarlar (en/boy farkı < %15). */
  snapCircles?: boolean
  /** Minimum çizgi uzunluğu (pt). */
  minDimension?: number
}

const DEFAULT_OPTIONS: Required<ShapeRecognitionOptions> = {
  snapAngles: true,
  snapCircles: true,
  minDimension: 12,
}

const dist = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y)

/** Noktaların toplam yol uzunluğunu hesaplar. */
export const pathLength = (pts: Point[]): number => {
  let len = 0
  for (let i = 0; i < pts.length - 1; i++) {
    len += dist(pts[i]!, pts[i + 1]!)
  }
  return len
}

/** Noktaların eksen hizalı sınırlayıcı kutusunu bulur. */
export const boundingBox = (pts: Point[]): { minX: number; minY: number; maxX: number; maxY: number; w: number; h: number } => {
  if (pts.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0 }
  let minX = pts[0]!.x
  let maxX = pts[0]!.x
  let minY = pts[0]!.y
  let maxY = pts[0]!.y
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]!
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY }
}

/** Noktanın doğru parçasına (a -> b) dik uzaklığı. */
const distToSegment = (p: Point, a: Point, b: Point): number => {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
  if (l2 === 0) return dist(p, a)
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2
  t = Math.max(0, Math.min(1, t))
  return dist(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) })
}

/** Düz çizgi tanıyıcı */
export const detectLine = (pts: Point[], opts: Required<ShapeRecognitionOptions>): RecognizedShape | null => {
  if (pts.length < 2) return null
  const p0 = pts[0]!
  const pEnd = pts[pts.length - 1]!
  const chord = dist(p0, pEnd)
  if (chord < opts.minDimension) return null

  const totalLen = pathLength(pts)
  if (totalLen === 0) return null

  // Düzlük oranı (baş-son mesafesi / toplam yol)
  const straightness = chord / totalLen
  if (straightness < 0.88) return null

  // Noktaların kirişe maksimum sapması
  let maxDev = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToSegment(pts[i]!, p0, pEnd)
    if (d > maxDev) maxDev = d
  }

  if (maxDev / chord > 0.12) return null

  let endX = pEnd.x
  let endY = pEnd.y

  if (opts.snapAngles) {
    const dx = pEnd.x - p0.x
    const dy = pEnd.y - p0.y
    const angle = Math.atan2(dy, dx)
    const threshold = 0.12 // ~7 derece

    // Yatay eksen (0 veya PI)
    if (Math.abs(angle) < threshold || Math.abs(Math.abs(angle) - Math.PI) < threshold) {
      endY = p0.y
    }
    // Dikey eksen (PI/2 veya -PI/2)
    else if (Math.abs(Math.abs(angle) - Math.PI / 2) < threshold) {
      endX = p0.x
    }
  }

  return {
    tool: 'line',
    points: [{ x: p0.x, y: p0.y, pressure: p0.pressure }, { x: endX, y: endY, pressure: pEnd.pressure }],
    confidence: straightness,
  }
}

/** Ok (Arrow) tanıyıcı: Ana gövdesi düz çizgi olan ve sonunda ok başı (V-şekli veya geri dönüş) bulunan çizimler */
export const detectArrow = (pts: Point[], opts: Required<ShapeRecognitionOptions>): RecognizedShape | null => {
  if (pts.length < 5) return null
  const p0 = pts[0]!
  const pEnd = pts[pts.length - 1]!
  const chord = dist(p0, pEnd)
  if (chord < opts.minDimension) return null

  // Ok çiziminin ilk %70-80'i gövdedir
  const stemCutIndex = Math.floor(pts.length * 0.75)
  const stemPts = pts.slice(0, stemCutIndex)
  if (stemPts.length < 2) return null

  const pStemEnd = stemPts[stemPts.length - 1]!
  const stemChord = dist(p0, pStemEnd)
  if (stemChord < opts.minDimension * 0.7) return null

  const stemLen = pathLength(stemPts)
  const stemStraightness = stemChord / (stemLen || 1)
  if (stemStraightness < 0.85) return null

  // Son %25'lik kısım: ok başı (başlangıç noktasına doğru geri dönüş veya kanat)
  const tipPts = pts.slice(stemCutIndex)
  let hasTurnBack = false
  const stemDirX = (pStemEnd.x - p0.x) / stemChord
  const stemDirY = (pStemEnd.y - p0.y) / stemChord

  for (let i = 1; i < tipPts.length; i++) {
    const prev = tipPts[i - 1]!
    const curr = tipPts[i]!
    const segDx = curr.x - prev.x
    const segDy = curr.y - prev.y
    const dot = segDx * stemDirX + segDy * stemDirY
    // Gövde yönünün tersine hareket (ok kanadı çizerken geri yönelim)
    if (dot < -0.3) {
      hasTurnBack = true
      break
    }
  }

  if (!hasTurnBack) return null

  let endX = pStemEnd.x
  let endY = pStemEnd.y

  if (opts.snapAngles) {
    const dx = pStemEnd.x - p0.x
    const dy = pStemEnd.y - p0.y
    const angle = Math.atan2(dy, dx)
    const threshold = 0.12 // ~7 derece
    if (Math.abs(angle) < threshold || Math.abs(Math.abs(angle) - Math.PI) < threshold) {
      endY = p0.y
    } else if (Math.abs(Math.abs(angle) - Math.PI / 2) < threshold) {
      endX = p0.x
    }
  }

  return {
    tool: 'arrow',
    points: [{ x: p0.x, y: p0.y, pressure: p0.pressure }, { x: endX, y: endY, pressure: pStemEnd.pressure }],
    confidence: stemStraightness,
  }
}

/** Elips / Daire tanıyıcı */
export const detectEllipse = (pts: Point[], opts: Required<ShapeRecognitionOptions>): RecognizedShape | null => {
  if (pts.length < 8) return null
  const p0 = pts[0]!
  const pEnd = pts[pts.length - 1]!
  const bbox = boundingBox(pts)
  if (bbox.w < opts.minDimension || bbox.h < opts.minDimension) return null

  const perimeterApprox = 2 * (bbox.w + bbox.h)
  const gap = dist(p0, pEnd)
  // Döngü kapanma oranı (baş ve son nokta birbirine yeterince yakın olmalı)
  if (gap / perimeterApprox > 0.28) return null

  const cx = bbox.minX + bbox.w / 2
  const cy = bbox.minY + bbox.h / 2
  const rx = bbox.w / 2
  const ry = bbox.h / 2

  let sumErr = 0
  for (const p of pts) {
    const qx = (p.x - cx) / rx
    const qy = (p.y - cy) / ry
    const q = Math.hypot(qx, qy)
    sumErr += Math.abs(q - 1)
  }
  const meanErr = sumErr / pts.length
  if (meanErr > 0.18) return null

  let minX = bbox.minX
  let minY = bbox.minY
  let maxX = bbox.maxX
  let maxY = bbox.maxY

  // Daireye kilitlenme (en ve boy farkı azsa)
  if (opts.snapCircles) {
    const maxDim = Math.max(bbox.w, bbox.h)
    const aspectDiff = Math.abs(bbox.w - bbox.h) / maxDim
    if (aspectDiff < 0.16) {
      const radius = maxDim / 2
      minX = cx - radius
      maxX = cx + radius
      minY = cy - radius
      maxY = cy + radius
    }
  }

  return {
    tool: 'ellipse',
    points: [{ x: minX, y: minY }, { x: maxX, y: maxY }],
    confidence: 1 - meanErr,
  }
}

/** Dikdörtgen / Kutu tanıyıcı */
export const detectRectangle = (pts: Point[], opts: Required<ShapeRecognitionOptions>): RecognizedShape | null => {
  if (pts.length < 8) return null
  const p0 = pts[0]!
  const pEnd = pts[pts.length - 1]!
  const bbox = boundingBox(pts)
  if (bbox.w < opts.minDimension || bbox.h < opts.minDimension) return null

  const perimeter = 2 * (bbox.w + bbox.h)
  const gap = dist(p0, pEnd)
  if (gap / perimeter > 0.28) return null

  // 4 kenara da noktaların düşüp düşmediğini kontrol et
  let nearLeft = 0
  let nearRight = 0
  let nearTop = 0
  let nearBottom = 0
  const edgeThreshold = Math.max(8, Math.min(bbox.w, bbox.h) * 0.2)

  let sumEdgeDist = 0
  for (const p of pts) {
    const dLeft = Math.abs(p.x - bbox.minX)
    const dRight = Math.abs(p.x - bbox.maxX)
    const dTop = Math.abs(p.y - bbox.minY)
    const dBottom = Math.abs(p.y - bbox.maxY)

    if (dLeft < edgeThreshold) nearLeft++
    if (dRight < edgeThreshold) nearRight++
    if (dTop < edgeThreshold) nearTop++
    if (dBottom < edgeThreshold) nearBottom++

    sumEdgeDist += Math.min(dLeft, dRight, dTop, dBottom)
  }

  // Her kenarda en az birkaç nokta olmalı
  const minPointsPerEdge = Math.max(2, Math.floor(pts.length * 0.08))
  if (
    nearLeft < minPointsPerEdge ||
    nearRight < minPointsPerEdge ||
    nearTop < minPointsPerEdge ||
    nearBottom < minPointsPerEdge
  ) {
    return null
  }

  const meanEdgeDist = sumEdgeDist / pts.length
  if (meanEdgeDist / Math.min(bbox.w, bbox.h) > 0.18) return null

  return {
    tool: 'rect',
    points: [{ x: bbox.minX, y: bbox.minY }, { x: bbox.maxX, y: bbox.maxY }],
    confidence: 1 - meanEdgeDist / perimeter,
  }
}

/**
 * Verilen serbest çizim noktalarından geometrik primitifi tanır.
 * Öncelik sırası: Çizgi -> Daire/Elips -> Dikdörtgen.
 */
export const recognizeShape = (
  pts: Point[],
  options?: ShapeRecognitionOptions
): RecognizedShape | null => {
  if (pts.length < 2) return null
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // 1. Ok (Arrow) kontrolü: gövde + ok ucu hareketi
  const arrow = detectArrow(pts, opts)
  if (arrow) return arrow

  // 2. Düz çizgi kontrolü (en hızlı ve yaygın hareket)
  const line = detectLine(pts, opts)
  if (line) return line

  // 3. Daire / Elips kontrolü
  const ellipse = detectEllipse(pts, opts)
  if (ellipse && ellipse.confidence > 0.85) return ellipse

  // 4. Dikdörtgen kontrolü
  const rect = detectRectangle(pts, opts)
  if (rect && (!ellipse || rect.confidence >= ellipse.confidence)) return rect

  return ellipse
}
