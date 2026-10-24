import { afterEach, describe, expect, it, vi } from 'vitest'

// ensurePdfTextFont: sahte doc + stub fetch ile kablolama testi.
// - doğru dosya adı/base64 ile VFS'e eklenmeli (32K+ dizi parça yolunu da zorlar),
// - font family aktifleştirilmeli,
// - fetch hatası export'u öldürmemeli ve sonraki export yeniden denemeli.

const mockDoc = () => ({
  addFileToVFS: vi.fn(),
  addFont: vi.fn(),
  setFont: vi.fn(),
})

const stubFontFetch = (bytes: Uint8Array) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, arrayBuffer: async () => bytes.buffer })),
  )

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('ensurePdfTextFont', () => {
  it('embeds the subset font and activates it (chunked base64)', async () => {
    const bytes = new Uint8Array(70_000).fill(7)
    stubFontFetch(bytes)
    const doc = mockDoc()
    const { ensurePdfTextFont } = await import('../src/render/pdfFont')
    await ensurePdfTextFont(doc as never)
    const [file, b64] = doc.addFileToVFS.mock.calls[0]! as [string, string]
    expect(file).toBe('fonts/NotoSans-Regular-subset.ttf')
    expect(b64).toBe(Buffer.from(bytes).toString('base64'))
    expect(doc.addFont).toHaveBeenCalledWith(file, 'NotoSans', 'normal')
    expect(doc.setFont).toHaveBeenCalledWith('NotoSans', 'normal')
  })

  it('survives fetch failure, retries on the next export', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
    const doc = mockDoc()
    const { ensurePdfTextFont } = await import('../src/render/pdfFont')
    await expect(ensurePdfTextFont(doc as never)).resolves.toBeUndefined()
    expect(doc.setFont).not.toHaveBeenCalled()

    stubFontFetch(new Uint8Array([1, 2, 3]))
    const doc2 = mockDoc()
    await ensurePdfTextFont(doc2 as never)
    expect(doc2.setFont).toHaveBeenCalledWith('NotoSans', 'normal')
  })
})
