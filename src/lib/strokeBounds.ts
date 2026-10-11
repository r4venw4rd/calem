import type { Stroke } from '../model/document'
import { strokeBBox } from './select'
import type { NormRect } from './select'

const cache = new WeakMap<Stroke, NormRect | null>()

export const cachedStrokeBBox = (stroke: Stroke): NormRect | null => {
  if (!cache.has(stroke)) cache.set(stroke, strokeBBox(stroke))
  return cache.get(stroke) ?? null
}

export const invalidateStrokeBBox = (stroke: Stroke): void => {
  cache.delete(stroke)
}
