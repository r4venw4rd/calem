import { describe, expect, it } from 'vitest'
import { paintStrokeTail } from '../src/render/strokes'

const context = () => {
  const curves: number[][] = []
  return {
    curves,
    ctx: {
      save() {},
      restore() {},
      beginPath() {},
      moveTo() {},
      stroke() {},
      setLineDash() {},
      bezierCurveTo: (...args: number[]) => curves.push(args),
    } as unknown as CanvasRenderingContext2D,
  }
}

describe('stroke spline rendering', () => {
  it('redraws only the tail segment range', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 3, y: 8 },
      { x: 10, y: 4 },
      { x: 15, y: 12 },
    ]
    const tail = context()
    paintStrokeTail(
      tail.ctx,
      {
        tool: 'pen',
        color: '#000000',
        width: 2,
        dash: 'solid',
        opacity: 1,
        points,
      },
      null,
      0,
      1,
      1,
      3,
    )
    expect(tail.curves).toHaveLength(2)
    expect(tail.curves[0]![4]).toBe(points[2]!.x)
    expect(tail.curves[1]![4]).toBe(points[3]!.x)
  })

  it('draws only segments added in a multi-point frame plus the smoothing overlap', () => {
    const points = Array.from({ length: 100 }, (_, i) => ({ x: i, y: Math.sin(i / 4) * 10 }))
    const tail = context()
    paintStrokeTail(
      tail.ctx,
      {
        tool: 'pen',
        color: '#000000',
        width: 2,
        dash: 'solid',
        opacity: 1,
        points,
      },
      null,
      0,
      96,
      1,
      99,
    )
    expect(tail.curves).toHaveLength(3)
    expect(tail.curves[0]![4]).toBe(points[97]!.x)
    expect(tail.curves[2]![4]).toBe(points[99]!.x)
  })
})
