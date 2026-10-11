import { describe, expect, it } from 'vitest'
import { takeObsoletePdfIds } from '../src/persist/pdfFileCleanup'

describe('takeObsoletePdfIds', () => {
  it('keeps the current PDF and returns old files for cleanup after save', () => {
    const pending = new Set(['old.pdf', 'current.pdf'])
    expect(takeObsoletePdfIds(pending, 'current.pdf')).toEqual(['old.pdf'])
    expect(pending.size).toBe(0)
  })

  it('cleans all pending PDFs when the saved document has no PDF', () => {
    expect(takeObsoletePdfIds(new Set(['old.pdf']), null)).toEqual(['old.pdf'])
  })
})
