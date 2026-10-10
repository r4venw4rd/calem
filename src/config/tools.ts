import type { Tool } from '../model/document'

// Araç kataloğu: sıra + geçerlilik beyaz listesi (toolbar config buradan beslenir).
// Varsayılan dizilim: kalem, silgi, vurgu, el, seç, şekiller, metin, resim.
export const ALL_TOOLS: Tool[] = [
  'pen',
  'eraser',
  'highlighter',
  'hand',
  'select',
  'line',
  'rect',
  'ellipse',
  'arrow',
  'text',
  'image',
]

/** Araç başına kalınlık aralığı (pt). */
export const WIDTH_MIN: Record<Tool, number> = {
  pen: 1,
  highlighter: 1,
  eraser: 5,
  select: 1,
  line: 1,
  rect: 1,
  ellipse: 1,
  arrow: 1,
  text: 1,
  image: 1,
  hand: 1,
}
export const WIDTH_MAX: Record<Tool, number> = {
  pen: 20,
  highlighter: 50,
  eraser: 120,
  select: 20,
  line: 20,
  rect: 20,
  ellipse: 20,
  arrow: 20,
  text: 20,
  image: 20,
  hand: 20,
}

/** Araç başına kalınlık hafızası tohumu. */
export const DEFAULT_WIDTHS: Record<Tool, number> = {
  pen: 3,
  highlighter: 10,
  eraser: 24,
  select: 3,
  line: 3,
  rect: 3,
  ellipse: 3,
  arrow: 3,
  text: 3,
  image: 3,
  hand: 3,
}

export type ToolIcon =
  | 'pen'
  | 'hl'
  | 'eraser'
  | 'hand'
  | 'select'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'arrow'
  | 'text'
  | 'image'

export interface ToolMeta {
  label: string
  title: string
  active: string
  icon: ToolIcon
}

/** Toolbar düğme metadatası (Türkçe etiketler burada tekillenir). */
export const TOOL_META: Record<Tool, ToolMeta> = {
  pen: { label: 'Kalem', title: 'Kalem (P)', active: 'bg-indigo-600 text-white', icon: 'pen' },
  highlighter: {
    label: 'Vurgu',
    title: 'Vurgulayıcı (H)',
    active: 'bg-yellow-500 text-black',
    icon: 'hl',
  },
  eraser: { label: 'Silgi', title: 'Silgi (E)', active: 'bg-red-600 text-white', icon: 'eraser' },
  hand: {
    label: 'El',
    title: 'El (sürükle-kaydır, veya Space basılı tut)',
    active: 'bg-indigo-600 text-white',
    icon: 'hand',
  },
  select: {
    label: 'Seç',
    title: 'Seç/Taşı (V)',
    active: 'bg-indigo-600 text-white',
    icon: 'select',
  },
  line: { label: 'Çizgi', title: 'Çizgi (L)', active: 'bg-indigo-600 text-white', icon: 'line' },
  rect: { label: 'Kare', title: 'Kare (R)', active: 'bg-indigo-600 text-white', icon: 'rect' },
  ellipse: { label: 'Elips', title: 'Elips (O)', active: 'bg-indigo-600 text-white', icon: 'ellipse' },
  arrow: { label: 'Ok', title: 'Ok (A)', active: 'bg-indigo-600 text-white', icon: 'arrow' },
  text: { label: 'Metin', title: 'Metin (T)', active: 'bg-indigo-600 text-white', icon: 'text' },
  image: { label: 'Resim', title: 'Resim (G)', active: 'bg-indigo-600 text-white', icon: 'image' },
}
