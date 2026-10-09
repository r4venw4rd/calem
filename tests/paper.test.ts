import { describe, expect, it } from 'vitest'
import {
  cleanPaperBackground,
  DEFAULT_PAPER_BACKGROUND,
  dottedPoints,
  graphLineXs,
  isPaperBackgroundType,
  marginLineX,
  PAPER_SPACING_MAX,
  PAPER_SPACING_MIN,
  ruledLineYs,
  staffLineYs,
} from '../src/lib/paper'

describe('isPaperBackgroundType', () => {
  it('gecerli tipleri kabul eder', () => {
    for (const t of ['blank', 'ruled', 'graph', 'dotted', 'staff']) {
      expect(isPaperBackgroundType(t)).toBe(true)
    }
  })
  it('gecersizi reddeder', () => {
    expect(isPaperBackgroundType('cizgili')).toBe(false)
    expect(isPaperBackgroundType(undefined)).toBe(false)
    expect(isPaperBackgroundType(3)).toBe(false)
  })
})

describe('cleanPaperBackground', () => {
  it('bosta default doner', () => {
    expect(cleanPaperBackground(undefined)).toEqual(DEFAULT_PAPER_BACKGROUND)
    expect(cleanPaperBackground(null)).toEqual(DEFAULT_PAPER_BACKGROUND)
    expect(cleanPaperBackground(42)).toEqual(DEFAULT_PAPER_BACKGROUND)
  })
  it('araligi kelepceler', () => {
    expect(cleanPaperBackground({ spacing: 1 }).spacing).toBe(PAPER_SPACING_MIN)
    expect(cleanPaperBackground({ spacing: 999 }).spacing).toBe(PAPER_SPACING_MAX)
    expect(cleanPaperBackground({ spacing: 30 }).spacing).toBe(30)
  })
  it('bozuk rengi defaultlar', () => {
    expect(cleanPaperBackground({ lineColor: 'kirmizi' }).lineColor).toBe(
      DEFAULT_PAPER_BACKGROUND.lineColor,
    )
    expect(cleanPaperBackground({ lineColor: '#ff0000' }).lineColor).toBe('#ff0000')
  })
  it('tipi korur, bilinmeyeni blank yapar', () => {
    expect(cleanPaperBackground({ type: 'graph' }).type).toBe('graph')
    expect(cleanPaperBackground({ type: 'x' }).type).toBe('blank')
  })
})

describe('geometri', () => {
  it('ruledLineYs adimlar', () => {
    expect(ruledLineYs(100, 30)).toEqual([30, 60, 90])
    expect(ruledLineYs(0, 20)).toEqual([])
  })
  it('graphLineXs adimlar', () => {
    expect(graphLineXs(100, 40)).toEqual([40, 80])
  })
  it('dottedPoints grid kurar', () => {
    const pts = dottedPoints(100, 100, 50 - 2)
    expect(pts).toHaveLength(4)
    expect(pts[0]).toEqual({ x: 48, y: 48 })
    expect(dottedPoints(0, 100, 20)).toEqual([])
  })
  it('staffLineYs besliler kurar', () => {
    const groups = staffLineYs(842, 28)
    expect(groups.length).toBeGreaterThan(0)
    for (const g of groups) expect(g).toHaveLength(5)
  })
  it('marginLineX dar sayfada yok', () => {
    expect(marginLineX(100)).toBeNull()
    expect(marginLineX(595)).toBe(72)
  })
})
