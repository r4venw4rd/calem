import type { ColorPalette } from '../model/document'

// Hazır renk setleri + limitler. Kullanıcı setleri IDB ayarlarda yaşar.

// Palet başına en fazla renk.
export const PALETTE_MAX_COLORS = 12

// En fazla palet sayısı.
export const PALETTE_MAX_COUNT = 8

// Custom satır slot sayısı (palet başına).
export const CUSTOM_SLOT_COUNT = 8

export const DEFAULT_PALETTES: ColorPalette[] = [
  {
    id: 'varsayilan',
    name: 'Varsayılan',
    colors: ['#ffffff', '#000000', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7'],
    customs: [],
  },
  {
    id: 'pastel',
    name: 'Pastel',
    colors: ['#fecaca', '#fed7aa', '#fef08a', '#bbf7d0', '#bfdbfe', '#ddd6fe', '#fbcfe8', '#ffffff'],
    customs: [],
  },
  {
    id: 'neon',
    name: 'Neon',
    colors: ['#ff0000', '#ff8000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffffff'],
    customs: [],
  },
]
