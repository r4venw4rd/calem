// Xournal++ (.xopp) dosya biçimi dönüştürücüsü.
// .xopp = gzip ile sıkıştırılmış XML belgesi.
// Tarayıcı ve Node.js uyumlu (Native CompressionStream/DecompressionStream kullanır, sıfır harici bağımlılık).

import type { Layer, Page, Point, Stroke, TextItem, Tool } from '../model/document'
import { newLayerId, newPageId, newStrokeId, newTextId } from '../persist/snapshot'

/** Gzip sıkıştırma */
export const compressGzip = async (data: string): Promise<Uint8Array> => {
  const encoder = new TextEncoder()
  const stream = new Response(data).body!.pipeThrough(new CompressionStream('gzip'))
  const buffer = await new Response(stream).arrayBuffer()
  return new Uint8Array(buffer)
}

/** Gzip açma */
export const decompressGzip = async (data: ArrayBuffer | Uint8Array): Promise<string> => {
  const stream = new Response(data as BodyInit).body!.pipeThrough(new DecompressionStream('gzip'))
  return await new Response(stream).text()
}

/** Calem hex rengini (#rrggbb veya #rgb) ve opaklığı Xournal++ 8-haneli hex formatına (#rrggbbaa) çevirir. */
export const toXoppColor = (color: string, opacity = 1): string => {
  let hex = color.trim()
  if (hex.startsWith('#')) hex = hex.slice(1)
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('')
  }
  if (hex.length !== 6) hex = '000000'
  const alpha = Math.round(Math.min(1, Math.max(0, opacity)) * 255)
    .toString(16)
    .padStart(2, '0')
  return `#${hex.toLowerCase()}${alpha}`
}

/** Xournal++ renginden (#rrggbbaa veya #rrggbb) Calem hex ve opaklık çıkarır. */
export const fromXoppColor = (colorStr: string): { color: string; opacity: number } => {
  let str = colorStr.trim()
  if (str.startsWith('#')) str = str.slice(1)
  if (str.length === 8) {
    const hex = `#${str.slice(0, 6)}`
    const alpha = parseInt(str.slice(6, 8), 16) / 255
    return { color: hex, opacity: Math.round(alpha * 100) / 100 }
  }
  if (str.length === 6) {
    return { color: `#${str}`, opacity: 1 }
  }
  return { color: '#000000', opacity: 1 }
}

/**
 * Calem primitif şekillerini (rect, ellipse, arrow) Xournal++'ın anlayacağı
 * çoklu-nokta sürekli çizgi vektörüne genişletir.
 */
export const shapeToXoppStrokePoints = (stroke: Stroke): Point[] => {
  const pts = stroke.points
  if (pts.length < 2) return pts
  const [a, b] = pts as [Point, Point]

  if (stroke.tool === 'rect') {
    const x0 = Math.min(a.x, b.x)
    const y0 = Math.min(a.y, b.y)
    const x1 = Math.max(a.x, b.x)
    const y1 = Math.max(a.y, b.y)
    return [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
      { x: x0, y: y0 },
    ]
  }

  if (stroke.tool === 'ellipse') {
    const cx = (a.x + b.x) / 2
    const cy = (a.y + b.y) / 2
    const rx = Math.abs(b.x - a.x) / 2
    const ry = Math.abs(b.y - a.y) / 2
    const segs = 36
    const out: Point[] = []
    for (let i = 0; i <= segs; i++) {
      const theta = (i / segs) * 2 * Math.PI
      out.push({
        x: cx + rx * Math.cos(theta),
        y: cy + ry * Math.sin(theta),
      })
    }
    return out
  }

  if (stroke.tool === 'arrow') {
    const ang = Math.atan2(b.y - a.y, b.x - a.x)
    const len = Math.max(8, stroke.width * 4)
    const spread = Math.PI / 7
    return [
      { x: a.x, y: a.y },
      { x: b.x, y: b.y },
      { x: b.x - len * Math.cos(ang - spread), y: b.y - len * Math.sin(ang - spread) },
      { x: b.x, y: b.y },
      { x: b.x - len * Math.cos(ang + spread), y: b.y - len * Math.sin(ang + spread) },
    ]
  }

  return pts
}

/** Calem belgesini Xournal++ XML dizgisine dönüştürür. */
export const serializeXoppXml = (pages: Page[], paperHex = '#ffffff'): string => {
  const lines: string[] = [
    '<?xml version="1.0" standalone="no"?>',
    '<xournal creator="Calem (Xournal++ Compatible)" fileversion="4">',
    '  <title>Calem Document</title>',
  ]

  for (const page of pages) {
    lines.push(`  <page width="${page.size.w.toFixed(2)}" height="${page.size.h.toFixed(2)}">`)
    lines.push(`    <background type="solid" color="${paperHex}" style="plain" />`)

    for (const layer of page.layers) {
      lines.push(`    <layer name="${escapeXml(layer.name)}">`)

      // Çizgileri ve şekilleri yaz
      for (const stroke of layer.strokes) {
        if (stroke.points.length === 0) continue
        const toolName = stroke.tool === 'highlighter' ? 'highlighter' : stroke.tool === 'eraser' ? 'eraser' : 'pen'
        const colorStr = toXoppColor(stroke.color, stroke.opacity)
        const widthVal = stroke.width.toFixed(2)

        const strokePoints = shapeToXoppStrokePoints(stroke)
        const coords = strokePoints.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')
        lines.push(`      <stroke tool="${toolName}" color="${colorStr}" width="${widthVal}">`)
        lines.push(`        ${coords}`)
        lines.push('      </stroke>')
      }

      lines.push('    </layer>')
    }

    // Metinleri ayrı bir katmanda veya sayfa sonuna ekle
    if (page.texts && page.texts.length > 0) {
      lines.push('    <layer name="Text Layer">')
      for (const t of page.texts) {
        const colorStr = toXoppColor(t.color, 1)
        lines.push(
          `      <text font="Sans" size="${t.size}" x="${t.x.toFixed(2)}" y="${t.y.toFixed(2)}" color="${colorStr}">` +
            `${escapeXml(t.text)}</text>`
        )
      }
      lines.push('    </layer>')
    }

    lines.push('  </page>')
  }

  lines.push('</xournal>')
  return lines.join('\n')
}

const escapeXml = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const unescapeXml = (str: string): string => {
  return str
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
}

/** Xournal++ XML dizgisini ayrıştırıp Calem Page[] dizisine dönüştürür. */
export const parseXoppXml = (xmlStr: string): { pages: Page[]; paperHex: string } => {
  const pages: Page[] = []
  let detectedPaperHex = '#ffffff'

  // <page ...> ... </page> bloklarını yakala
  const pageRegex = /<page\b([^>]*)>([\s\S]*?)<\/page>/gi
  let pageMatch: RegExpExecArray | null

  while ((pageMatch = pageRegex.exec(xmlStr)) !== null) {
    const pageAttrs = pageMatch[1] ?? ''
    const pageContent = pageMatch[2] ?? ''

    const widthMatch = pageAttrs.match(/width="([^"]+)"/)
    const heightMatch = pageAttrs.match(/height="([^"]+)"/)
    const w = widthMatch ? parseFloat(widthMatch[1]!) : 595
    const h = heightMatch ? parseFloat(heightMatch[1]!) : 842

    // Arkaplan rengi
    const bgMatch = pageContent.match(/<background\b[^>]*color="([^"]+)"[^>]*>/i)
    if (bgMatch && bgMatch[1]) {
      const parsedBg = fromXoppColor(bgMatch[1])
      detectedPaperHex = parsedBg.color
    }

    const layers: Layer[] = []
    const texts: TextItem[] = []

    // <layer ...> ... </layer> bloklarını yakala
    const layerRegex = /<layer\b([^>]*)>([\s\S]*?)<\/layer>/gi
    let layerMatch: RegExpExecArray | null

    while ((layerMatch = layerRegex.exec(pageContent)) !== null) {
      const layerAttrs = layerMatch[1] ?? ''
      const layerContent = layerMatch[2] ?? ''
      const nameMatch = layerAttrs.match(/name="([^"]+)"/)
      const layerName = nameMatch ? unescapeXml(nameMatch[1]!) : `Layer ${layers.length + 1}`

      const strokes: Stroke[] = []

      // <stroke ...> ... </stroke>
      const strokeRegex = /<stroke\b([^>]*)>([\s\S]*?)<\/stroke>/gi
      let strokeMatch: RegExpExecArray | null

      while ((strokeMatch = strokeRegex.exec(layerContent)) !== null) {
        const sAttrs = strokeMatch[1] ?? ''
        const sData = (strokeMatch[2] ?? '').trim()

        const toolMatch = sAttrs.match(/tool="([^"]+)"/)
        const colorMatch = sAttrs.match(/color="([^"]+)"/)
        const widthMatch = sAttrs.match(/width="([^"]+)"/)

        let tool: Tool = 'pen'
        if (toolMatch) {
          const t = toolMatch[1]!.toLowerCase()
          if (t === 'highlighter') tool = 'highlighter'
          else if (t === 'eraser') tool = 'eraser'
        }

        const { color, opacity } = colorMatch ? fromXoppColor(colorMatch[1]!) : { color: '#000000', opacity: 1 }
        const width = widthMatch ? Math.max(1, parseFloat(widthMatch[1]!)) : 2

        const rawNumbers = sData.split(/\s+/).map((n) => parseFloat(n)).filter((n) => !Number.isNaN(n))
        const pts: Point[] = []
        for (let i = 0; i < rawNumbers.length - 1; i += 2) {
          pts.push({ x: rawNumbers[i]!, y: rawNumbers[i + 1]! })
        }

        if (pts.length > 0) {
          strokes.push({
            id: newStrokeId(),
            tool,
            color,
            width,
            dash: 'solid',
            opacity,
            points: pts,
          })
        }
      }

      // <text ...> ... </text>
      const textRegex = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi
      let textMatch: RegExpExecArray | null

      while ((textMatch = textRegex.exec(layerContent)) !== null) {
        const tAttrs = textMatch[1] ?? ''
        const tData = (textMatch[2] ?? '').trim()

        const xMatch = tAttrs.match(/x="([^"]+)"/)
        const yMatch = tAttrs.match(/y="([^"]+)"/)
        const sizeMatch = tAttrs.match(/size="([^"]+)"/)
        const colorMatch = tAttrs.match(/color="([^"]+)"/)

        const x = xMatch ? parseFloat(xMatch[1]!) : 50
        const y = yMatch ? parseFloat(yMatch[1]!) : 50
        const size = sizeMatch ? parseFloat(sizeMatch[1]!) : 14
        const { color } = colorMatch ? fromXoppColor(colorMatch[1]!) : { color: '#000000' }

        if (tData) {
          texts.push({
            id: newTextId(),
            x,
            y,
            text: unescapeXml(tData),
            color,
            size,
          })
        }
      }

      if (strokes.length > 0 || layerName !== 'Text Layer') {
        layers.push({
          id: newLayerId(),
          name: layerName,
          visible: true,
          strokes,
        })
      }
    }

    if (layers.length === 0) {
      layers.push({
        id: newLayerId(),
        name: 'Layer 1',
        visible: true,
        strokes: [],
      })
    }

    pages.push({
      id: newPageId(),
      size: { w, h },
      layers,
      activeLayerId: layers[0]!.id,
      texts,
      images: [],
    })
  }

  if (pages.length === 0) {
    // Boş belge güvencesi
    const defaultLayer: Layer = { id: newLayerId(), name: 'Layer 1', visible: true, strokes: [] }
    pages.push({
      id: newPageId(),
      size: { w: 595, h: 842 },
      layers: [defaultLayer],
      activeLayerId: defaultLayer.id,
      texts: [],
      images: [],
    })
  }

  return { pages, paperHex: detectedPaperHex }
}

/** Calem sayfalarını doğrudan .xopp (gzipped XML) binary dosyasına dönüştürür. */
export const exportXoppBytes = async (pages: Page[], paperHex?: string): Promise<Uint8Array> => {
  const xml = serializeXoppXml(pages, paperHex)
  return await compressGzip(xml)
}

/** .xopp (gzipped veya düz XML) ikili verisini Calem sayfalarına dönüştürür. */
export const importXoppBytes = async (bytes: ArrayBuffer | Uint8Array): Promise<{ pages: Page[]; paperHex: string }> => {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let xmlText = ''

  // Gzip magic number kontrolü (1f 8b)
  if (u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b) {
    xmlText = await decompressGzip(u8)
  } else {
    // Sıkıştırılmamış (.xoj gibi düz XML)
    xmlText = new TextDecoder().decode(u8)
  }

  return parseXoppXml(xmlText)
}
