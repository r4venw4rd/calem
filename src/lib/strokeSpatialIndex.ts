import type { Point, Stroke } from '../model/document'
import { expandRect, subRunsInRect as subRunsLinear, type NormRect } from './select'

type StrokePath = Pick<Stroke, 'points'>
type Index = { cells: Map<string, number[]>; long: number[]; count: number }
const indexes = new WeakMap<StrokePath, Index>()
const CELL = 256
const MAX_CELLS_PER_SEGMENT = 16
const MAX_QUERY_CELLS = 4096

const key = (x: number, y: number) => `${x}:${y}`

const build = (pts: readonly Point[]): Index => {
  const cells = new Map<string, number[]>()
  const long: number[] = []
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const x0 = Math.floor(Math.min(a.x, b.x) / CELL)
    const x1 = Math.floor(Math.max(a.x, b.x) / CELL)
    const y0 = Math.floor(Math.min(a.y, b.y) / CELL)
    const y1 = Math.floor(Math.max(a.y, b.y) / CELL)
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_CELLS_PER_SEGMENT) {
      long.push(i)
      continue
    }
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const k = key(x, y)
        const list = cells.get(k)
        if (list) list.push(i)
        else cells.set(k, [i])
      }
  }
  return { cells, long, count: pts.length }
}

export const invalidateStrokeSpatialIndex = (stroke: StrokePath) => indexes.delete(stroke)

// Cached candidate segments avoid rescanning every point during repeated dirty repaints.
export const indexedSubRunsInRect = (
  stroke: StrokePath,
  rect: NormRect,
  inflate: number,
  neighborPad = 2,
): Point[][] => {
  const pts = stroke.points
  if (pts.length < 128) return subRunsLinear(pts, rect, inflate, neighborPad)
  let index = indexes.get(stroke)
  if (!index || index.count !== pts.length) {
    index = build(pts)
    indexes.set(stroke, index)
  }
  const r = expandRect(rect, inflate)
  const x0 = Math.floor(r.x0 / CELL)
  const x1 = Math.floor(r.x1 / CELL)
  const y0 = Math.floor(r.y0 / CELL)
  const y1 = Math.floor(r.y1 / CELL)
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_QUERY_CELLS) return subRunsLinear(pts, rect, inflate, neighborPad)
  const candidates = new Set(index.long)
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      for (const i of index.cells.get(key(x, y)) ?? []) candidates.add(i)
    }
  const selected = [...candidates]
    .filter((i) => {
      const a = pts[i]!
      const b = pts[i + 1]!
      return (
        Math.max(a.x, b.x) >= r.x0 &&
        Math.min(a.x, b.x) <= r.x1 &&
        Math.max(a.y, b.y) >= r.y0 &&
        Math.min(a.y, b.y) <= r.y1
      )
    })
    .sort((a, b) => a - b)
  if (!selected.length) return []
  const runs: Point[][] = []
  let start = Math.max(0, selected[0]! - neighborPad)
  let end = Math.min(pts.length - 1, selected[0]! + 1 + neighborPad)
  for (const i of selected.slice(1)) {
    const lo = Math.max(0, i - neighborPad)
    const hi = Math.min(pts.length - 1, i + 1 + neighborPad)
    if (lo <= end + 1) end = Math.max(end, hi)
    else {
      runs.push(pts.slice(start, end + 1))
      start = lo
      end = hi
    }
  }
  runs.push(pts.slice(start, end + 1))
  return runs
}
