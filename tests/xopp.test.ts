import { describe, expect, it } from 'vitest'
import {
  exportXoppBytes,
  fromXoppColor,
  importXoppBytes,
  parseXoppXml,
  serializeXoppXml,
  toXoppColor,
} from '../src/lib/xopp'
import type { Page } from '../src/model/document'

describe('xopp adapter', () => {
  it('converts colors to and from Xournal++ format', () => {
    expect(toXoppColor('#ff0000', 1)).toBe('#ff0000ff')
    expect(toXoppColor('#123456', 0.5)).toBe('#12345680')
    expect(toXoppColor('#fff', 1)).toBe('#ffffffff')

    const p1 = fromXoppColor('#00ff00ff')
    expect(p1.color).toBe('#00ff00')
    expect(p1.opacity).toBe(1)

    const p2 = fromXoppColor('#12345680')
    expect(p2.color).toBe('#123456')
    expect(p2.opacity).toBeCloseTo(0.5, 1)
  })

  it('serializes and parses XML roundtrip', () => {
    const pages: Page[] = [
      {
        id: 'p1',
        size: { w: 600, h: 800 },
        activeLayerId: 'l1',
        layers: [
          {
            id: 'l1',
            name: 'Notes',
            visible: true,
            strokes: [
              {
                id: 's1',
                tool: 'pen',
                color: '#3b82f6',
                width: 3,
                dash: 'solid',
                opacity: 1,
                points: [
                  { x: 10, y: 20 },
                  { x: 30, y: 40 },
                  { x: 50, y: 60 },
                ],
              },
            ],
          },
        ],
        texts: [
          {
            id: 't1',
            x: 100,
            y: 150,
            text: 'Hello Xournal++',
            color: '#10b981',
            size: 16,
          },
        ],
        images: [],
      },
    ]

    const xml = serializeXoppXml(pages, '#f5f1e8')
    expect(xml).toContain('<xournal')
    expect(xml).toContain('width="600.00"')
    expect(xml).toContain('Hello Xournal++')

    const { pages: imported, paperHex } = parseXoppXml(xml)
    expect(paperHex).toBe('#f5f1e8')
    expect(imported).toHaveLength(1)
    expect(imported[0]!.size).toEqual({ w: 600, h: 800 })
    expect(imported[0]!.layers[0]!.strokes).toHaveLength(1)
    const st = imported[0]!.layers[0]!.strokes[0]!
    expect(st.tool).toBe('pen')
    expect(st.color).toBe('#3b82f6')
    expect(st.width).toBe(3)
    expect(st.points).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 60 },
    ])
    expect(imported[0]!.texts).toHaveLength(1)
    expect(imported[0]!.texts[0]!.text).toBe('Hello Xournal++')
  })

  it('compresses to gzip and decompresses bytes roundtrip', async () => {
    const pages: Page[] = [
      {
        id: 'p1',
        size: { w: 595, h: 842 },
        activeLayerId: 'l1',
        layers: [
          {
            id: 'l1',
            name: 'Main',
            visible: true,
            strokes: [
              {
                id: 's1',
                tool: 'highlighter',
                color: '#facc15',
                width: 12,
                dash: 'solid',
                opacity: 0.5,
                points: [
                  { x: 100, y: 100 },
                  { x: 200, y: 100 },
                ],
              },
            ],
          },
        ],
        texts: [],
        images: [],
      },
    ]

    const compressedBytes = await exportXoppBytes(pages, '#ffffff')
    // Gzip magic number check: 0x1f, 0x8b
    expect(compressedBytes[0]).toBe(0x1f)
    expect(compressedBytes[1]).toBe(0x8b)

    const imported = await importXoppBytes(compressedBytes)
    expect(imported.pages).toHaveLength(1)
    const st = imported.pages[0]!.layers[0]!.strokes[0]!
    expect(st.tool).toBe('highlighter')
    expect(st.color).toBe('#facc15')
    expect(st.width).toBe(12)
    expect(st.points).toEqual([
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ])
  })
})
