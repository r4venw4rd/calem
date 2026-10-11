import { BACKING_MAX_AREA, BACKING_MAX_SIDE } from '../config/engine'

// İstenen DPR ölçeğini canvas limitlerine sığdır. Limit aşımında ölçek
// düşürülür: allocation patlaması (donma) ya da boş canvas yerine hafif blur.
// Saf fonksiyon — tests/backing.test.ts kilitler.
export function capBackingScale(cssW: number, cssH: number, want: number): number {
  if (!(cssW > 0) || !(cssH > 0) || !(want > 0)) return want
  let scale = want
  const area = cssW * scale * cssH * scale
  if (area > BACKING_MAX_AREA) scale = Math.sqrt(BACKING_MAX_AREA / (cssW * cssH))
  const longest = Math.max(cssW, cssH) * scale
  if (longest > BACKING_MAX_SIDE) scale = BACKING_MAX_SIDE / Math.max(cssW, cssH)
  return Math.min(scale, want)
}
