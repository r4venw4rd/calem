import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TIER,
  MEMBERSHIP_TIERS,
  TIER_QUOTAS,
  canAddPage,
  canUseCloud,
  isTier,
  storageQuotaBytes,
} from '../src/config/membership'

// Placeholder kilitleri: kota sayıları en son belirlenecek; değişim bilinçli yapılır.
describe('membership', () => {
  it('katmanlar ve varsayılan', () => {
    expect(MEMBERSHIP_TIERS).toEqual(['free', 'pro'])
    expect(DEFAULT_TIER).toBe('free')
  })
  it('placeholder kotalar', () => {
    expect(TIER_QUOTAS.free).toEqual({ maxPages: 100, quotaBytes: 100 * 1024 * 1024 })
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
    expect(canAddPage(99, 'free')).toBe(true)
    expect(canAddPage(100, 'free')).toBe(false)
    expect(canAddPage(999, 'pro')).toBe(true)
    expect(canAddPage(1000, 'pro')).toBe(false)
    expect(canAddPage(-1, 'free')).toBe(false)
    expect(canAddPage(NaN, 'free')).toBe(false)
  })
  it('storageQuotaBytes', () => {
    expect(storageQuotaBytes('free')).toBe(100 * 1024 * 1024)
    expect(storageQuotaBytes('pro')).toBe(1024 * 1024 * 1024)
  })
  it('bulut kapısı: tier kilit değil rozet', () => {
    expect(canUseCloud('free')).toBe(true)
    expect(canUseCloud('pro')).toBe(true)
  })
})
