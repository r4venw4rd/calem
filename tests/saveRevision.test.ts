import { describe, expect, it } from 'vitest'
import { isLatestSave } from '../src/persist/saveRevision'

describe('isLatestSave', () => {
  it('only clears pending state when no newer edit arrived during the write', () => {
    expect(isLatestSave(4, 4)).toBe(true)
    expect(isLatestSave(4, 5)).toBe(false)
  })
})
