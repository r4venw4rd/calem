import { describe, expect, it } from 'vitest'
import { detectEllipse, detectLine, detectRectangle, recognizeShape } from '../src/lib/shapeRecognition'
import type { Point } from '../src/model/document'

describe('shapeRecognition', () => {
  describe('detectLine', () => {
    it('recognizes a perfectly straight horizontal line', () => {
      const pts: Point[] = [
        { x: 10, y: 50 },
        { x: 30, y: 50 },
        { x: 60, y: 50 },
        { x: 100, y: 50 },
      ]
      const res = recognizeShape(pts)
      expect(res).not.toBeNull()
      expect(res?.tool).toBe('line')
      expect(res?.points[0]).toEqual({ x: 10, y: 50, pressure: undefined })
      expect(res?.points[1]).toEqual({ x: 100, y: 50, pressure: undefined })
    })

    it('snaps a slightly angled line to horizontal when within threshold', () => {
      // dy = 2 over dx = 100 -> angle ~ 1.1 degree < 7 degree
      const pts: Point[] = [
        { x: 10, y: 50 },
        { x: 50, y: 51 },
        { x: 110, y: 52 },
      ]
      const res = recognizeShape(pts, { snapAngles: true })
      expect(res?.tool).toBe('line')
      expect(res?.points[1].y).toBe(50) // snapped to horizontal
    })

    it('snaps a slightly angled line to vertical when within threshold', () => {
      const pts: Point[] = [
        { x: 50, y: 10 },
        { x: 51, y: 60 },
        { x: 52, y: 110 },
      ]
      const res = recognizeShape(pts, { snapAngles: true })
      expect(res?.tool).toBe('line')
      expect(res?.points[1].x).toBe(50) // snapped to vertical
    })

    it('rejects short lines below minDimension', () => {
      const pts: Point[] = [
        { x: 10, y: 10 },
        { x: 14, y: 14 },
      ]
      const res = recognizeShape(pts, { minDimension: 12 })
      expect(res).toBeNull()
    })

    it('rejects a curved stroke as a line', () => {
      // S-curve
      const pts: Point[] = [
        { x: 0, y: 0 },
        { x: 25, y: 30 },
        { x: 50, y: 0 },
        { x: 75, y: -30 },
        { x: 100, y: 0 },
      ]
      const line = detectLine(pts, { minDimension: 12, snapAngles: true, snapCircles: true })
      expect(line).toBeNull()
    })
  })

  describe('detectEllipse & circle', () => {
    it('recognizes a drawn circle and snaps to a perfect circle', () => {
      const pts: Point[] = []
      const cx = 100
      const cy = 100
      const r = 40
      const count = 20
      for (let i = 0; i <= count; i++) {
        const theta = (i / count) * 2 * Math.PI
        // Add tiny noise
        const noise = (i % 2 === 0 ? 1 : -1) * 1.5
        pts.push({
          x: cx + (r + noise) * Math.cos(theta),
          y: cy + (r + noise) * Math.sin(theta),
        })
      }
      const res = recognizeShape(pts)
      expect(res).not.toBeNull()
      expect(res?.tool).toBe('ellipse')
      // Snapped circle has equal width and height
      const [a, b] = res!.points
      const w = Math.abs(b.x - a.x)
      const h = Math.abs(b.y - a.y)
      expect(Math.abs(w - h)).toBeLessThan(0.01)
    })

    it('recognizes an elongated ellipse', () => {
      const pts: Point[] = []
      const cx = 150
      const cy = 100
      const rx = 80
      const ry = 30
      const count = 24
      for (let i = 0; i <= count; i++) {
        const theta = (i / count) * 2 * Math.PI
        pts.push({
          x: cx + rx * Math.cos(theta),
          y: cy + ry * Math.sin(theta),
        })
      }
      const res = recognizeShape(pts)
      expect(res?.tool).toBe('ellipse')
      const [a, b] = res!.points
      const w = Math.abs(b.x - a.x)
      const h = Math.abs(b.y - a.y)
      expect(w).toBeGreaterThan(h * 2)
    })

    it('rejects an unclosed arc as an ellipse', () => {
      const pts: Point[] = []
      // Half circle (open)
      for (let i = 0; i <= 12; i++) {
        const theta = (i / 12) * Math.PI
        pts.push({ x: 100 + 40 * Math.cos(theta), y: 100 + 40 * Math.sin(theta) })
      }
      const res = detectEllipse(pts, { minDimension: 12, snapAngles: true, snapCircles: true })
      expect(res).toBeNull()
    })
  })

  describe('detectRectangle', () => {
    it('recognizes a drawn rectangle', () => {
      const pts: Point[] = [
        // Top edge
        { x: 50, y: 50 },
        { x: 80, y: 50 },
        { x: 120, y: 51 },
        { x: 150, y: 50 },
        // Right edge
        { x: 150, y: 70 },
        { x: 149, y: 90 },
        { x: 150, y: 110 },
        // Bottom edge
        { x: 120, y: 110 },
        { x: 80, y: 109 },
        { x: 50, y: 110 },
        // Left edge
        { x: 51, y: 90 },
        { x: 50, y: 70 },
        { x: 50, y: 52 },
      ]
      const res = recognizeShape(pts)
      expect(res).not.toBeNull()
      expect(res?.tool).toBe('rect')
      const [a, b] = res!.points
      expect(a.x).toBeCloseTo(50, 0)
      expect(a.y).toBeCloseTo(50, 0)
      expect(b.x).toBeCloseTo(150, 0)
      expect(b.y).toBeCloseTo(110, 0)
    })

    it('rejects a drawn triangle from being recognized as rectangle or ellipse', () => {
      // Equilateral-like triangle (3 sharp sides)
      const pts: Point[] = []
      // Top (50, 10) to bottom-right (100, 90)
      for (let i = 0; i <= 10; i++) {
        const t = i / 10
        pts.push({ x: 50 + 50 * t, y: 10 + 80 * t })
      }
      // Bottom-right to bottom-left (0, 90)
      for (let i = 1; i <= 10; i++) {
        const t = i / 10
        pts.push({ x: 100 - 100 * t, y: 90 })
      }
      // Bottom-left to top (50, 10)
      for (let i = 1; i <= 10; i++) {
        const t = i / 10
        pts.push({ x: 0 + 50 * t, y: 90 - 80 * t })
      }
      const res = recognizeShape(pts)
      // Şimdilik üçgen henüz ayrı bir primitif aracı olarak çizilmediği için
      // kesinlikle kareye veya daireye dönüştürülmemelidir!
      expect(res).toBeNull()
    })
  })

  describe('detectArrow', () => {
    it('recognizes a straight horizontal stroke ending with an arrowhead hook', () => {
      const pts: Point[] = [
        // Shaft (left to right)
        { x: 20, y: 100 },
        { x: 50, y: 100 },
        { x: 80, y: 100 },
        { x: 120, y: 100 },
        { x: 150, y: 100 },
        // Barb (turning back towards top-left)
        { x: 140, y: 90 },
        { x: 130, y: 80 },
      ]
      const res = recognizeShape(pts)
      expect(res).not.toBeNull()
      expect(res?.tool).toBe('arrow')
      expect(res?.points[0]).toEqual({ x: 20, y: 100, pressure: undefined })
      expect(res?.points[1].x).toBe(150)
      expect(res?.points[1].y).toBe(100)
    })

    it('distinguishes a pure line from an arrow', () => {
      const linePts: Point[] = [
        { x: 20, y: 100 },
        { x: 80, y: 100 },
        { x: 140, y: 100 },
      ]
      const res = recognizeShape(linePts)
      expect(res?.tool).toBe('line')
    })
  })
})
