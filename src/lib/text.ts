// Metin kutusu sarma: kutu genişliğine (pt) kelime bazlı sarma yardımcıları.
// Tuval (canvas) ve PDF export aynı satırları üretsin diye kaba bir karakter
// genişliği tahmini kullanılır (ölçüm API'si olmadan deterministik).

import type { TextItem } from '../model/document'

/** Tahmini karakter genişliği / punto oranı (0.62 ≈ sans-serif ortalama). */
export const TEXT_CHAR_WIDTH_RATIO = 0.62

/**
 * Metni `w` punto genişliğine sarar ve satır dizisi döndürür.
 * - `w <= 0` ise yalnızca '\n' ile bölünür (serbest metin).
 * - Kelime satıra sığmıyorsa sert bölünür.
 */
export const wrapTextToWidth = (text: string, w: number, size: number): string[] => {
  const paras = text.split('\n')
  if (!(w > 0) || !(size > 0)) return paras
  const max = Math.max(1, Math.floor(w / (size * TEXT_CHAR_WIDTH_RATIO)))
  const out: string[] = []
  for (const para of paras) {
    if (para.length <= max) {
      out.push(para)
      continue
    }
    let line = ''
    for (const word of para.split(' ')) {
      if (word.length > max) {
        if (line) {
          out.push(line)
          line = ''
        }
        let rest = word
        while (rest.length > max) {
          out.push(rest.slice(0, max))
          rest = rest.slice(max)
        }
        line = rest
        continue
      }
      if (!line) {
        line = word
      } else if (line.length + 1 + word.length <= max) {
        line += ' ' + word
      } else {
        out.push(line)
        line = word
      }
    }
    out.push(line)
  }
  return out
}

// Kutu genişliği varsa sarma sonrası satır sayısı tahmini (kaba).
export const estimateLines = (t: TextItem): number => {
  if (!t.w || t.w <= 0) return t.text.split('\n').length
  return Math.max(1, wrapTextToWidth(t.text, t.w, t.size).length)
}

// Metin kaba kutusu (ölçümsüz tahmin; vuruş-testi ve daire-değme için yeterli).
export const textBBoxOf = (t: TextItem): { x0: number; y0: number; x1: number; y1: number } => {
  const lines = t.text.split('\n')
  const w = t.w && t.w > 0 ? t.w : Math.max(...lines.map((l) => l.length)) * t.size * TEXT_CHAR_WIDTH_RATIO + 8
  const h = estimateLines(t) * t.size * 1.25 + 4
  return { x0: t.x - 4, y0: t.y - 4, x1: t.x + w, y1: t.y + h }
}
