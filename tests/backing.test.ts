import { describe, expect, it } from 'vitest'
import { capBackingScale } from '../src/lib/canvasLimits'
import { BACKING_MAX_AREA, BACKING_MAX_SIDE } from '../src/config/engine'

describe('capBackingScale', () => {
  it('normal boyutta istenen ölçeğe dokunmaz', () => {
    expect(capBackingScale(836, 1183, 2)).toBe(2)
    expect(capBackingScale(1920, 1080, 2)).toBe(2)
  })

  it('alan aşımında ölçeği alana sığdırır', () => {
    const s = capBackingScale(6688, 9464, 2)
    expect(s).toBeLessThan(2)
    expect(s).toBeGreaterThan(0)
    // Kenar tavanı da devrede: en uzun kenar 8192'yi geçemez.
    expect(9464 * s).toBeLessThanOrEqual(BACKING_MAX_SIDE + 1)
    expect(6688 * s * (9464 * s)).toBeLessThanOrEqual(BACKING_MAX_AREA + 1)
  })

  it('aşırı en-boy oranında kenar tavanı uygular', () => {
    const s = capBackingScale(24000, 800, 2)
    expect(24000 * s).toBeLessThanOrEqual(BACKING_MAX_SIDE + 1)
    expect(s).toBeGreaterThan(0)
  })

  it('geçersiz girdide fikirsiz döner (çağıran gardlar)', () => {
    expect(capBackingScale(0, 100, 2)).toBe(2)
    expect(capBackingScale(100, 100, 0)).toBe(0)
  })
})
