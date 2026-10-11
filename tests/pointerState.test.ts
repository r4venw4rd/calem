import { describe, expect, it } from 'vitest'
import { usePointerState } from '../src/composables/usePointerState'

const ev = (pointerId: number) => ({ pointerId }) as unknown as PointerEvent

describe('aktif pointer kilidi', () => {
  it('setActive/isActive/clearActive', () => {
    const ps = usePointerState()
    expect(ps.activeId()).toBeNull()
    ps.setActive(7)
    expect(ps.activeId()).toBe(7)
    expect(ps.isActive(7)).toBe(true)
    expect(ps.isActive(8)).toBe(false)
    ps.clearActive()
    expect(ps.activeId()).toBeNull()
  })

  it('stale: e verilmeden veya kilit yokken false', () => {
    const ps = usePointerState()
    expect(ps.stale(undefined)).toBe(false)
    expect(ps.stale(ev(1))).toBe(false)
    ps.setActive(1)
    expect(ps.stale(undefined)).toBe(false)
    expect(ps.stale(ev(1))).toBe(false)
    expect(ps.stale(ev(2))).toBe(true)
  })
})

describe('space-pan modifier', () => {
  it('toggle', () => {
    const ps = usePointerState()
    expect(ps.spacePan()).toBe(false)
    ps.setSpacePan(true)
    expect(ps.spacePan()).toBe(true)
    ps.setSpacePan(false)
    expect(ps.spacePan()).toBe(false)
  })
})

describe('pointer havuzu', () => {
  it('track/has/moveTracked/count/clearPointers', () => {
    const ps = usePointerState()
    ps.track(1, { x: 0, y: 0 })
    expect(ps.has(1)).toBe(true)
    expect(ps.count()).toBe(1)
    ps.moveTracked(1, { x: 5, y: 6 })
    expect(ps.positions()).toEqual([{ x: 5, y: 6 }])
    // bilinmeyen id'de false, havuz değişmez
    expect(ps.moveTracked(99, { x: 1, y: 1 })).toBe(false)
    ps.clearPointers()
    expect(ps.count()).toBe(0)
  })
})

describe('pinch jesti', () => {
  it('beginGesture + stepGesture ölçek/merkez/delta', () => {
    const ps = usePointerState()
    ps.track(1, { x: 0, y: 0 })
    ps.track(2, { x: 20, y: 0 })
    ps.beginGesture()
    expect(ps.gestureLocked()).toBe(true)

    ps.moveTracked(2, { x: 40, y: 0 })
    const step = ps.stepGesture()!
    expect(step.scale).toBeCloseTo(2)
    expect(step.midX).toBeCloseTo(20)
    expect(step.midY).toBeCloseTo(0)
    expect(step.dx).toBeCloseTo(10) // merkez 10 → 20
    expect(step.dy).toBeCloseTo(0)
  })

  it('stepGesture jest yoksa null', () => {
    const ps = usePointerState()
    ps.track(1, { x: 0, y: 0 })
    expect(ps.stepGesture()).toBeNull()
  })

  it('d0=0 iken ölçek 0, jest yine güncellenir', () => {
    const ps = usePointerState()
    ps.track(1, { x: 5, y: 5 })
    ps.track(2, { x: 5, y: 5 })
    ps.beginGesture()
    const step = ps.stepGesture()!
    expect(step.scale).toBe(0)
    expect(step.midX).toBeCloseTo(5)
  })
})

describe('releasePointer', () => {
  it('parmaklar kalkana dek kilitli kalır', () => {
    const ps = usePointerState()
    ps.track(1, { x: 0, y: 0 })
    ps.track(2, { x: 10, y: 0 })
    ps.beginGesture()
    // ilk parmak kalktı: hâlâ jest artığı yüzünden kilitli
    expect(ps.releasePointer(1).locked).toBe(true)
    expect(ps.count()).toBe(1)
    expect(ps.gestureLocked()).toBe(true)
    // ikinci de kalktı: kilit çözülür
    expect(ps.releasePointer(2).locked).toBe(false)
    expect(ps.count()).toBe(0)
    expect(ps.gestureLocked()).toBe(false)
  })

  it('id verilmezse havuz değişmez ama kilit durumu raporlanır', () => {
    const ps = usePointerState()
    expect(ps.releasePointer(undefined).locked).toBe(false)
    ps.track(1, { x: 0, y: 0 })
    ps.track(2, { x: 10, y: 0 })
    ps.beginGesture()
    expect(ps.releasePointer(undefined).locked).toBe(true)
    expect(ps.count()).toBe(2)
  })

  it('iki parmakla hızlı dokunma (two-finger tap) undo tetikler', () => {
    const ps = usePointerState()
    ps.track(1, { x: 10, y: 10 })
    ps.track(2, { x: 30, y: 10 })
    expect(ps.releasePointer(1).tapAction).toBeUndefined()
    const rel2 = ps.releasePointer(2)
    expect(rel2.locked).toBe(false)
    expect(rel2.tapAction).toBe('undo')
  })

  it('üç parmakla hızlı dokunma (three-finger tap) redo tetikler', () => {
    const ps = usePointerState()
    ps.track(1, { x: 10, y: 10 })
    ps.track(2, { x: 30, y: 10 })
    ps.track(3, { x: 50, y: 10 })
    expect(ps.releasePointer(1).tapAction).toBeUndefined()
    expect(ps.releasePointer(2).tapAction).toBeUndefined()
    const rel3 = ps.releasePointer(3)
    expect(rel3.locked).toBe(false)
    expect(rel3.tapAction).toBe('redo')
  })
})

