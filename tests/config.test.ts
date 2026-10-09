import { describe, expect, it } from 'vitest'
import {
  B64_CHUNK,
  DIRTY_PAD_SCREEN,
  DPR_CAP,
  EXPORT_SCALE,
  FALLBACK_VIEWPORT,
  HISTORY_CAP,
  IMAGE_MAX_DIM,
  JPEG_QUALITY,
  MIN_DIST_SCREEN,
  PAGE_MAX,
  PAGE_MIN,
  PDF_MANY_THRESHOLD,
  PDF_RENDER_BASE,
  PDF_RENDER_MANY,
  PDF_RENDER_MAX,
  RERENDER_DELAY,
  SAVE_DELAY,
  ZOOM_MAX,
  ZOOM_MIN,
} from '../src/config/engine'
import { A4, DEFAULT_PAPER_BACKGROUND, PAGE_FORMATS, PAPER_THEMES } from '../src/config/paper'
import { ALL_TOOLS, DEFAULT_WIDTHS, TOOL_META, WIDTH_MAX, WIDTH_MIN } from '../src/config/tools'
import {
  CUSTOM_SLOT_COUNT,
  DEFAULT_PALETTES,
  PALETTE_MAX_COLORS,
  PALETTE_MAX_COUNT,
} from '../src/config/palettes'

// Değer kilitleri: davranış değişikliği bilinçli yapılır, sessiz kayma olmaz.
describe('engine', () => {
  it('zoom aralığı', () => {
    expect(ZOOM_MIN).toBe(0.5)
    expect(ZOOM_MAX).toBe(8)
  })
  it('history derinliği', () => {
    expect(HISTORY_CAP).toBe(25)
  })
  it('render ölçekleri', () => {
    expect(EXPORT_SCALE).toBe(2)
    expect([PDF_RENDER_BASE, PDF_RENDER_MANY, PDF_RENDER_MAX]).toEqual([3, 1.5, 4])
    expect(PDF_MANY_THRESHOLD).toBe(30)
    expect(DPR_CAP).toBe(2)
    expect(IMAGE_MAX_DIM).toBe(1600)
    expect(JPEG_QUALITY).toBe(0.9)
  })
  it('zamanlamalar', () => {
    expect(RERENDER_DELAY).toBe(600)
    expect(SAVE_DELAY).toBe(800)
  })
  it('eşikler ve limitler', () => {
    expect(MIN_DIST_SCREEN).toBe(1.5)
    expect(DIRTY_PAD_SCREEN).toBe(36)
    expect([PAGE_MIN, PAGE_MAX]).toEqual([100, 3000])
    expect(FALLBACK_VIEWPORT).toEqual({ w: 800, h: 600 })
    expect(B64_CHUNK).toBe(0x8000)
  })
})

describe('paper', () => {
  it('A4 punto', () => {
    expect(A4).toEqual({ w: 595, h: 842 })
  })
  it('kagit temalari', () => {
    expect(PAPER_THEMES).toEqual({ gece: '#111827', siyah: '#000000', kagit: '#f5f1e8' })
  })
  it('sayfa bicimleri', () => {
    expect(PAGE_FORMATS.A4).toEqual({ w: 595, h: 842 })
    expect(Object.keys(PAGE_FORMATS)).toEqual(['A4', 'A3', 'A5', 'Letter'])
  })
  it('varsayilan desen', () => {
    expect(DEFAULT_PAPER_BACKGROUND).toEqual({
      type: 'blank',
      spacing: 28,
      lineColor: '#334155',
      margin: false,
      marginColor: '#ef4444',
    })
  })
})

describe('tools', () => {
  it('katalog tam ve sirali', () => {
    expect(ALL_TOOLS).toEqual([
      'pen',
      'highlighter',
      'eraser',
      'select',
      'line',
      'rect',
      'ellipse',
      'arrow',
      'text',
      'image',
      'hand',
    ])
  })
  it('kalinlik tablolari tum araclari kapsar', () => {
    for (const t of ALL_TOOLS) {
      expect(WIDTH_MIN[t]).toBeGreaterThanOrEqual(1)
      expect(WIDTH_MAX[t]).toBeGreaterThan(WIDTH_MIN[t])
      expect(DEFAULT_WIDTHS[t]).toBeGreaterThanOrEqual(WIDTH_MIN[t])
      expect(DEFAULT_WIDTHS[t]).toBeLessThanOrEqual(WIDTH_MAX[t])
    }
    expect(WIDTH_MAX.eraser).toBe(120)
  })
  it('meta tum araclari kapsar', () => {
    for (const t of ALL_TOOLS) {
      expect(TOOL_META[t].label.length).toBeGreaterThan(0)
      expect(TOOL_META[t].title.length).toBeGreaterThan(0)
      expect(TOOL_META[t].active.length).toBeGreaterThan(0)
    }
  })
})

describe('palettes', () => {
  it('limitler', () => {
    expect(PALETTE_MAX_COLORS).toBe(12)
    expect(PALETTE_MAX_COUNT).toBe(8)
    expect(CUSTOM_SLOT_COUNT).toBe(8)
  })
  it('hazir setler', () => {
    expect(DEFAULT_PALETTES.map((p) => p.id)).toEqual(['varsayilan', 'pastel', 'neon'])
    for (const p of DEFAULT_PALETTES) {
      expect(p.colors).toHaveLength(8)
      expect(p.customs).toEqual([])
    }
  })
})
