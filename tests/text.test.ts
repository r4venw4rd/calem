import { describe, expect, it } from 'vitest'
import { TEXT_CHAR_WIDTH_RATIO, wrapTextToWidth } from '../src/lib/text'

// size=10, ratio=0.62 → karakter başı ~6.2pt. w=62 → max 10 karakter/satır.
const W = 62
const SIZE = 10

describe('wrapTextToWidth', () => {
  it('w<=0 veya gecersiz boyutta yalnizca \\n ile boler', () => {
    expect(wrapTextToWidth('bir iki', 0, SIZE)).toEqual(['bir iki'])
    expect(wrapTextToWidth('bir\niki', -5, SIZE)).toEqual(['bir', 'iki'])
    expect(wrapTextToWidth('bir iki', W, 0)).toEqual(['bir iki'])
  })

  it('sigan metni bolmez', () => {
    expect(wrapTextToWidth('kisa', W, SIZE)).toEqual(['kisa'])
  })

  it('uzun metni kelime sinirinda sarar', () => {
    // max=10: "aaa bbb " -> 10'a kadar.
    const out = wrapTextToWidth('aaa bbb ccc ddd', W, SIZE)
    expect(out.length).toBeGreaterThan(1)
    for (const line of out) expect(line.length).toBeLessThanOrEqual(10)
    // Kelimeler korunur (sert bolme yok).
    expect(out.join(' ')).toBe('aaa bbb ccc ddd')
  })

  it('sigmayan tek kelimeyi sert boler', () => {
    const out = wrapTextToWidth('abcdefghijklmnop', W, SIZE)
    expect(out).toEqual(['abcdefghij', 'klmnop'])
  })

  it('paragraflari korur ve satir sayisini hesaplar', () => {
    expect(wrapTextToWidth('bir\niki\nuc', W, SIZE)).toEqual(['bir', 'iki', 'uc'])
    // Bos paragraf bos satir uretir.
    expect(wrapTextToWidth('a\n\nb', W, SIZE)).toEqual(['a', '', 'b'])
  })

  it('iki satira yayilan ornek makul', () => {
    const out = wrapTextToWidth('Lorem ipsum dolor sit amet', W, SIZE)
    expect(out.length).toBeGreaterThan(1)
    expect(out[0]!.length).toBeLessThanOrEqual(10)
  })

  it('ratio sabiti kullanilir', () => {
    // max = floor(w / (size*ratio)) = floor(62 / 6.2) = 10
    expect(Math.floor(W / (SIZE * TEXT_CHAR_WIDTH_RATIO))).toBe(10)
  })
})
