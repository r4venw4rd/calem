import { PAPER_SPACING_MAX, PAPER_SPACING_MIN } from './paper'

// UI-bound aralıklar: template slider/input sınırları tek kaynaktan beslenir.
// Kural: UI aralığı store kelepçesinden DAR olabilir, GENİŞ olamaz.
export const SLIDERS = {
  opacity: { min: 0.1, max: 1, step: 0.05 },
  textSize: { min: 8, max: 72, step: 1 },
  paperSpacing: { min: PAPER_SPACING_MIN, max: PAPER_SPACING_MAX, step: 1 },
  pressure: { min: 0, max: 2, step: 0.1 },
  smoothing: { min: 0, max: 0.9, step: 0.05 },
  imageWidth: { min: 32, max: 1200, step: 4 },
  uiScale: { min: 0.8, max: 1.4, step: 0.05 },
} as const

export type SliderKey = keyof typeof SLIDERS
