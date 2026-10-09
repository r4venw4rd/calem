import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TIER,
  FOUNDER_DISCOUNT_PCT,
  MEMBERSHIP_TIERS,
  TIER_QUOTAS,
  applyDiscount,
  canAddPage,
  canUseCloud,
  isTier,
  storageQuotaBytes,
} from '../src/config/membership'

// Kota kilitleri: free Supabase free tavanına göre yerden (bkz. BACKEND.md),
// pro placeholder; değişim bilinçli yapılır.
describe('membership', () => {
  it('katmanlar ve varsayılan', () => {
    expect(MEMBERSHIP_TIERS).toEqual(['free', 'pro'])
    expect(DEFAULT_TIER).toBe('free')
  })
  it('kotalar', () => {
    expect(TIER_QUOTAS.free).toEqual({ maxPages: 50, quotaBytes: 25 * 1024 * 1024 })
    expect(TIER_QUOTAS.pro).toEqual({ maxPages: 1000, quotaBytes: 1024 * 1024 * 1024 })
  })
  it('isTier', () => {
    expect(isTier('free')).toBe(true)
    expect(isTier('pro')).toBe(true)
    expect(isTier('gold')).toBe(false)
    expect(isTier(undefined)).toBe(false)
  })
  it('canAddPage sınırları', () => {
    expect(canAddPage(0, 'free')).toBe(true)
    expect(canAddPage(49, 'free')).toBe(true)
    expect(canAddPage(50, 'free')).toBe(false)
    expect(canAddPage(999, 'pro')).toBe(true)
    expect(canAddPage(1000, 'pro')).toBe(false)
    expect(canAddPage(-1, 'free')).toBe(false)
    expect(canAddPage(NaN, 'free')).toBe(false)
  })
  it('storageQuotaBytes', () => {
    expect(storageQuotaBytes('free')).toBe(25 * 1024 * 1024)
    expect(storageQuotaBytes('pro')).toBe(1024 * 1024 * 1024)
  })
  it('bulut kapısı: tier kilit değil rozet', () => {
    expect(canUseCloud('free')).toBe(true)
    expect(canUseCloud('pro')).toBe(true)
  })
  it('kurucu indirimi: oran kilitli, matematik aşağı yuvarlar', () => {
    expect(FOUNDER_DISCOUNT_PCT).toBe(50)
    expect(applyDiscount(1000, 50)).toBe(500)
    expect(applyDiscount(999, 50)).toBe(499)
    expect(applyDiscount(1000, 0)).toBe(1000)
    expect(applyDiscount(1000, 100)).toBe(1)
    expect(applyDiscount(0, 50)).toBe(0)
    expect(applyDiscount(NaN, 50)).toBe(0)
  })
})
