// Üyelik katmanı: tier rozeti + kota kapıları (saf fonksiyonlar).
// Local'da özellik kilidi YOKTUR — üyelik yalnızca bulutu açar (sync/kota/paylaşım).
// Free kota Supabase free tavanına göre yerden seçildi (doğrulama: 2026-10,
// supabase.com/docs + /pricing); pro sayı placeholder'dır, billing öncesi kesinleşir.
// Davranış değişikliği burada yapılır, tests/membership.test.ts kilitler.

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

// Free kota Supabase FREE proje tavanının (500MB DB + 1GB storage + 5GB egress/ay,
// TÜM kullanıcılara toplam — kullanıcı başına değil) rahat altında tutulur.
// 25MB: vektör mürekkep KB'ler mertebesindedir, binlerce sayfa + birkaç resim alır;
// 40 kullanıcı × 25MB = 1GB proje tavanı. Tavan yaklaşınca ücretsiz kullanıcı alımı
// durur veya Pro plana ($25/ay) geçilir — ilk sabit gider kalemidir (bkz. BACKEND.md).
// Pro kota ücretli proje tavanına göre placeholder'dır (100GB storage).
export const TIER_QUOTAS: Record<MembershipTier, TierQuota> = {
  free: { maxPages: 50, quotaBytes: 25 * 1024 * 1024 },
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

// Kurucu üye: erken kullanıcıya ücretli geçişte rozet + ömür indirimi sözü.
// "Tuzağa düştüm" hissi yaratmadan geçişin sözleşmesidir; oran billing öncesi sabittir.
export const FOUNDER_DISCOUNT_PCT = 50

/** Kuruş fiyatına yüzde indirimi uygular (aşağı yuvarlanır, kuruş altı 1 kuruşa sabitlenir). */
export const applyDiscount = (cents: number, pct: number): number => {
  if (!Number.isFinite(cents) || cents <= 0) return 0
  const p = Math.min(100, Math.max(0, pct))
  return Math.max(1, Math.floor((cents * (100 - p)) / 100))
}
