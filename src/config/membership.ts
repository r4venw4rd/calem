// Üyelik katmanı: tier rozeti + kota kapıları (saf fonksiyonlar).
// Local'da özellik kilidi YOKTUR — üyelik yalnızca bulutu açar (sync/kota/paylaşım).
// Kota sayıları placeholder'dır, en son belirlenecek. Davranış değişikliği burada
// yapılır, tests/membership.test.ts kilitler.

/** Üyelik katmanı (bulut rozeti; local'da kapı açmaz). */
export type MembershipTier = 'free' | 'pro'

export const MEMBERSHIP_TIERS: MembershipTier[] = ['free', 'pro']

/** Varsayılan katman: herkes free başlar, local anonim de free'dir. */
export const DEFAULT_TIER: MembershipTier = 'free'

export interface TierQuota {
  /** Bulut senkronundaki en fazla sayfa (local sınırsızdır). */
  maxPages: number
  /** Bulut dosya kotası (bayt; local IDB'yi bağlamaz). */
  quotaBytes: number
}

// Placeholder kotalar — billing/sync gelmeden kesinleşir.
export const TIER_QUOTAS: Record<MembershipTier, TierQuota> = {
  free: { maxPages: 100, quotaBytes: 100 * 1024 * 1024 },
  pro: { maxPages: 1000, quotaBytes: 1024 * 1024 * 1024 },
}

/** Katman geçerliliği (bozuk string → false; çağrıcı DEFAULT_TIER'e düşer). */
export const isTier = (t: unknown): t is MembershipTier =>
  t === 'free' || t === 'pro'

/** Bulut kotası: bu katmanda o kadar sayfa daha eklenebilir mi? (local'da çağrılmaz). */
export const canAddPage = (currentPages: number, tier: MembershipTier): boolean =>
  Number.isFinite(currentPages) &&
  currentPages >= 0 &&
  currentPages < (TIER_QUOTAS[tier] ?? TIER_QUOTAS.free).maxPages

/** Bulut dosya kotası (bayt). */
export const storageQuotaBytes = (tier: MembershipTier): number =>
  (TIER_QUOTAS[tier] ?? TIER_QUOTAS.free).quotaBytes

/** Bulut özelliği bu katmana açık mı? (bugün: sync/pro-paylaşım yalnızca pro değil,
 *  free de sync alır — kapı kota ile çizilir, tier ile değil. Fonksiyon dikiş içindir.) */
export const canUseCloud = (_tier: MembershipTier): boolean => true
