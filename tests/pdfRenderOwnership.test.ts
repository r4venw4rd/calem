// pdf.js transfers the ArrayBuffer passed to getDocument({ data }) to the worker,
// detaching it on the main thread. renderPdf* must therefore never hand over the
// caller's buffer: after a session restore the shared pdfBytesCache gets consumed
// by the initial render, and every later zoom re-render silently fails on the
// zero-length leftover.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getDocument } = vi.hoisted(() => ({ getDocument: vi.fn() }))

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: (opts: { data: Uint8Array }) => getDocument(opts),
}))

// Mimic pdf.js: transfer (detach) the received buffer, then fail like a worker error.
const transferAndReject = (opts: { data: Uint8Array }) => {
  try {
    structuredClone(opts.data.buffer, { transfer: [opts.data.buffer] })
  } catch {
    /* if the runtime refuses transfers, the identity check below still carries the test */
  }
  return { promise: Promise.reject(new Error('worker boom')) }
}

beforeEach(() => {
  getDocument.mockReset()
  getDocument.mockImplementation(transferAndReject)
})

describe('renderPdfPages buffer ownership', () => {
  it('does not let pdf.js detach the caller buffer', async () => {
    const { renderPdfPages } = await import('../src/lib/pdf')
    const bytes = new Uint8Array([1, 2, 3])
    await expect(renderPdfPages(bytes)).rejects.toThrow('worker boom')
    const passed = getDocument.mock.calls[0]![0]! as { data: Uint8Array }
    expect(passed.data.buffer).not.toBe(bytes.buffer)
    expect(bytes.byteLength).toBe(3)
  })
})

describe('renderPdfPageAt buffer ownership', () => {
  it('does not let pdf.js detach the caller buffer', async () => {
    const { renderPdfPageAt } = await import('../src/lib/pdf')
    const bytes = new Uint8Array([4, 5])
    await expect(renderPdfPageAt(bytes, 0, 2)).rejects.toThrow('worker boom')
    const passed = getDocument.mock.calls[0]![0]! as { data: Uint8Array }
    expect(passed.data.buffer).not.toBe(bytes.buffer)
    expect(bytes.byteLength).toBe(2)
  })
})
