import { ALL_TOOLS } from '../config/tools'
import {
  CUSTOM_SLOT_COUNT,
  PALETTE_MAX_COLORS,
  PALETTE_MAX_COUNT,
} from '../config/palettes'
import {
  PAGE_FORMATS,
  type PageFormat,
  type PageOrientation,
} from '../config/paper'
import { cleanPaperBackground, type PaperBackground } from '../lib/paper'
import { PAGE_MAX, PAGE_MIN } from '../config/engine'
import { isLocale, type Locale } from '../config/locale'
import { SLIDERS } from '../config/ui'
import { storage } from '../lib/idb'
import { newStrokeId } from './snapshot'
import type {
  AppSettings,
  ColorPalette,
  EraserMode,
  Tool,
  ToolbarConfig,
  UiTheme,
} from '../model/document'

export const SETTINGS_KEY = 'calem-app-settings'
export type { AppSettings }

export const cleanUiScale = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(SLIDERS.uiScale.max, Math.max(SLIDERS.uiScale.min, Math.round(v * 20) / 20))
    : null

export const cleanHexColor = (v: unknown): string | null =>
  typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null

export const cleanCustomList = (input: unknown): string[] => {
  if (!Array.isArray(input)) return []
  const clean: string[] = []
  for (const c of input) {
    const hex = cleanHexColor(c)
    if (hex && !clean.includes(hex) && clean.length < CUSTOM_SLOT_COUNT) clean.push(hex)
  }
  return clean
}

export const cleanPalettes = (input: unknown): ColorPalette[] => {
  if (!Array.isArray(input)) return []
  const out: ColorPalette[] = []
  for (const p of input) {
    if (!p || typeof p !== 'object' || out.length >= PALETTE_MAX_COUNT) continue
    const r = p as Record<string, unknown>
    if (!Array.isArray(r.colors)) continue
    const colors: string[] = []
    for (const c of r.colors) {
      const hex = cleanHexColor(c)
      if (hex && !colors.includes(hex) && colors.length < PALETTE_MAX_COLORS) colors.push(hex)
    }
    if (colors.length === 0) continue
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : newStrokeId(),
      name:
        typeof r.name === 'string' && r.name.trim()
          ? r.name.trim().slice(0, 24)
          : `Palet ${out.length + 1}`,
      colors,
      customs: cleanCustomList(r.customs),
    })
  }
  return out
}

export const cleanToolbar = (input: unknown): ToolbarConfig => {
  const fb: ToolbarConfig = { order: [...ALL_TOOLS], hidden: [] }
  if (!input || typeof input !== 'object') return fb
  const r = input as Record<string, unknown>
  const order: Tool[] = []
  if (Array.isArray(r.order)) {
    for (const t of r.order) {
      if (
        typeof t === 'string' &&
        (ALL_TOOLS as string[]).includes(t) &&
        !order.includes(t as Tool)
      ) {
        order.push(t as Tool)
      }
    }
  }
  for (const t of ALL_TOOLS) if (!order.includes(t)) order.push(t)
  const hidden: Tool[] = []
  if (Array.isArray(r.hidden)) {
    for (const t of r.hidden) {
      if (
        typeof t === 'string' &&
        (ALL_TOOLS as string[]).includes(t) &&
        !hidden.includes(t as Tool)
      ) {
        hidden.push(t as Tool)
      }
    }
  }
  return { order, hidden }
}

export const migrateToolbarHand = (order: Tool[]): Tool[] => {
  const next: Tool[] = order.filter((t) => t !== 'hand')
  const ei = next.indexOf('eraser')
  const at = ei === -1 ? Math.min(2, next.length) : ei + 1
  next.splice(at, 0, 'hand')
  return next
}

export const migrateEraserFirst = (order: Tool[]): Tool[] =>
  order.map((t) => {
    if (t === 'eraser') return 'highlighter'
    if (t === 'highlighter') return 'eraser'
    return t
  })

export const loadStoredSettings = async (): Promise<AppSettings | null> => {
  try {
    const raw = await storage.getKey<AppSettings>(SETTINGS_KEY)
    if (!raw || (raw.v !== 1 && raw.v !== 2 && raw.v !== 3 && raw.v !== 4 && raw.v !== 5 && raw.v !== 6)) {
      return null
    }
    return raw
  } catch {
    return null
  }
}

export const saveStoredSettings = async (doc: AppSettings): Promise<void> => {
  try {
    await storage.setKey(SETTINGS_KEY, doc)
  } catch {
    /* sessiz */
  }
}
