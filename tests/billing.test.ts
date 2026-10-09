import { describe, expect, it } from 'vitest'
import {
  NoopBillingProvider,
  getBilling,
  setBillingProvider,
} from '../src/lib/billing'

describe('billing', () => {
  it('noop: her zaman free + kurucusuz', async () => {
    const b = new NoopBillingProvider()
    expect(b.kind).toBe('noop')
    expect(await b.getStatus()).toEqual({ tier: 'free', founder: false })
  })
  it('noop: checkout/portal açıkça reddeder', async () => {
    const b = new NoopBillingProvider()
    await expect(b.checkout('pro')).rejects.toThrow('billing not configured')
    await expect(b.openPortal()).rejects.toThrow('billing not configured')
  })
  it('onBillingChange anında çağırır, unsubscribe keser', async () => {
    const b = new NoopBillingProvider()
    const seen: string[] = []
    const off = b.onBillingChange((s) => seen.push(s.tier))
    await new Promise((r) => setTimeout(r, 0))
    off()
    expect(seen).toEqual(['free'])
  })
  it('global binding değişir ve geri alınır', () => {
    const prev = getBilling()
    const b = new NoopBillingProvider()
    setBillingProvider(b)
    expect(getBilling()).toBe(b)
    setBillingProvider(prev)
    expect(getBilling()).toBe(prev)
  })
})
