// Fatura dikişi: MoR (Polar/Lemon Squeezy) sonradan aynı imzayla takılır.
// Ağ yok, checkout yok — sadece arayüz + noop varsayılan. Fiyat ilgisi
// bekleme listesiyle DEĞİL, kurucu üye sözü + gerçek checkout ile ölçülecek.
// tests/billing.test.ts kilitler.

import type { MembershipTier } from '../config/membership'
import { DEFAULT_TIER } from '../config/membership'

/** Fatura durumu (bulut tarafı; local her zaman free + kurucusuzdur). */
export interface BillingStatus {
  tier: MembershipTier
  founder: boolean
}

export type BillingListener = (s: BillingStatus) => void

/** MoR sağlayıcısının takılacağı imza (hepsi async; noop reddeder). */
export interface BillingProvider {
  readonly kind: string
  getStatus(): Promise<BillingStatus>
  checkout(planId: string): Promise<void>
  openPortal(): Promise<void>
  onBillingChange(cb: BillingListener): () => void
}

/** Faturalama bağlanmadı — checkout/portal açıkça reddeder (sessiz başarısızlık yok). */
export class NoopBillingProvider implements BillingProvider {
  readonly kind = 'noop'
  private listeners = new Set<BillingListener>()

  async getStatus(): Promise<BillingStatus> {
    return { tier: DEFAULT_TIER, founder: false }
  }

  async checkout(_planId: string): Promise<void> {
    throw new Error('billing not configured')
  }

  async openPortal(): Promise<void> {
    throw new Error('billing not configured')
  }

  onBillingChange(cb: BillingListener): () => void {
    this.listeners.add(cb)
    // Abone anında mevcut durumu alır (auth deseni).
    void this.getStatus().then(
      (s) => cb(s),
      () => cb({ tier: DEFAULT_TIER, founder: false }),
    )
    return () => {
      this.listeners.delete(cb)
    }
  }
}

// Aktif sağlayıcı (canlı binding — gerçek MoR setBillingProvider ile takılır).
let active: BillingProvider = new NoopBillingProvider()

export const getBilling = (): BillingProvider => active
export const setBillingProvider = (p: BillingProvider): void => {
  active = p
}
