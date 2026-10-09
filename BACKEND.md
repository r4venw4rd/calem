# Calem Backend Planı

Calem bulut bağlantılı olacak. Henüz planlanmamış cloud spec'leri: **cloud sync**, **membership**, **accounts**, **authentication**.

## Katmanlar
### 1. `src/config/` (kod sabitleri)
Sabit paketesi tek kaynaktır: `engine.ts` (görünüm/render/zamanlama/limitler), `tools.ts` (araç kataloğu, kalınlık tabloları, TOOL_META etiketleri), `paper.ts` (kâğıt/sayfa varsayılanları), `palettes.ts` (hazır setler, cap'ler), `ui.ts` (slider aralıkları), `files.ts` (dosya adları, accept filtreleri, SW yolu). Davranış değişikliği burada yapılır, `tests/config.test.ts` kilitler.

### 2. IndexedDB (local gerçek kaynak)
Cookie/localStorage yok, olmayacak — cookie 4KB ve her HTTP isteğinde gider; MB'larca stroke + resim/PDF bytes için yanlış araç. Tek kaynak IndexedDB: `docs` store (çizim + ayarlar), `files` store (PDF/resim bytes). Ayar şeması versiyonlu (v1→v4), yeni alan optional + presence-check ile göçer, versiyon şişirilmez.

### 3. Backend tohumu (hesap/auth/sync/membership dikişleri — saf kurallar kod, ağ yok)
- **Auth seam:** `AuthProvider` interface (`getUser/signIn/signOut/onAuthChange`), default `LocalAuthProvider` (tek anonim local kullanıcı). Gerçek auth sonradan aynı imzayla takılır: e-posta+şifre ve OAuth (Google) ayrı sağlayıcılar, local üçüncü sağlayıcı olarak kalır. Login ekranı yok — sadece dikiş + anonim akış.
- **User-scoped depolama:** `DocStorage` interface arkasında IDB adaptörü (`idbStorage`, `setStorage` ile değişir). Hesap gelince: kullanıcı başına key namespace + dokümanlara `ownerId`; backward-compatible göçle (mevcut veri anonim local'e).
- **Sync motoru:** offline-first outbox deseni; doküman `{v, savedAt}` taşıyor. Çakışma kuralı: sayfa-seviyesi last-write-wins (sayfa `updatedAt`'ine göre birleşir). Silinen sayfalar tombstone ile senkronize edilir. İçerik-adresli dosya bytes (eksikse yükle).
- **Membership:** `MembershipTier` (free/pro), kota kapıları saf fonksiyon (`canAddPage`, `storageQuotaBytes`) `config/membership.ts` placeholder sabitleriyle; kota sayıları en son belirlenecek. Local'da özellik kilidi yok — üyelik yalnızca bulutu açar (sync/kota/paylaşım), tier rozettir kapı açmaz. Billing kodu yok.
- **Anonim→hesap taşıma:** login sonrası "local veriyi hesaba taşı?" modalı, varsayılan EVET, tek tık. Otomatik merge yok; `.calem` import'u asla otomatik upload edilmez.

## Bulut maliyet gerçekleri (doğrulandı: 2026-10, supabase.com/docs + /pricing)

Supabase FREE tavanları **proje başına toplamdır** (kullanıcı başına değil):

| Kaynak | Free | Pro ($25/ay) |
|---|---|---|
| DB boyutu | 500 MB (aşınca read-only kilit) | 8 GB dahil |
| Dosya storage | 1 GB | 100 GB dahil |
| Egress | 5 GB + 5 GB cache /ay | 250 GB dahil |
| Auth MAU | 50.000 | 100.000 dahil |
| Proje | 2 aktif | duraklatma yok |

- **7 gün işlemsizlik → proje duraklatılır** (uyarı e-postası gelir, 1 yıl içinde dashboard'dan resume, cold-start 10-30sn). Günlük birkaç sorgu canlı tutar ama gerçek kullanıcıya "senkronum çalışmıyor" yaşatır.
- **Free'de otomatik yedek YOKTUR** — `.calem` dışa aktarım yedek görevi görür, görünür kalır.
- Kota matematiği: free 25MB × 40 kullanıcı = 1GB tavan. Tavan yaklaşınca ücretsiz alım durur veya Pro'ya geçilir.

Kararlar:
- Sync ilk günden **"beta"** etiketli açılır; `.calem` dışa aktarım yedek olarak menüde kalır.
- PDF arkaplan bytes'ları sync'e girmez (local'de yeniden import edilir); yalnızca vektör mürekkep + küçük resimler senkronlanır — storage/egress'i korur.
- İlk sabit gider: Supabase Pro ~$25/ay. İlk gelirden önce kapatılması gereken kalemdir.
- Dağıtım hamleleri (faturalama yokken bile): bekleme listesi butonu YOK — karar: önce altyapı dikişi. MoR (Polar/Lemon Squeezy ~%5 + $0.50 — küçük sepette ~%10 efektif, doğrula) hesabını erken açıp KYC/onayı bekletme. Erken kullanıcıya **kurucu üye rozeti + %50 ömür indirimi** sözü (`FOUNDER_DISCOUNT_PCT`, `CalemUser.founder`) — ücretli geçişte "tuzağa düştüm" hissi olmaz.

## Fazlar
- **Faz 1 — `src/config/` paketi:** sabit taşıma + kilit testleri (yapıldı).
- **Faz 2 — storage interface:** `DocStorage` + IDB adaptörü (yapıldı).
- **Faz 3 — UI tekrarları:** slider sınırları, TOOL_META, dosya adları (yapıldı).
- **Faz 4 — backend tohumları:** auth + user-scoped storage + sync kuralları + membership (yapıldı, ağ yok).
  - `src/lib/auth.ts`: `AuthProvider` + `LocalAuthProvider` (tek anonim local kullanıcı), `getAuth/setAuthProvider` binding.
  - `src/lib/idb.ts`: `PersistedDocV5.ownerId?` (yoksa `local-anon`, göçsüz), `docOwner`, `namespaceFor`, `namespacedStorage` (doc+ayar öneklenir, içerik-adresli dosyalar global).
  - `src/lib/sync.ts`: saf kurallar — `mergePages` (sayfa LWW, eşitlikte local), `mergeTombstones`, `applyTombstones`, `mergeDocuments`, outbox (`enqueueOp/ackOps/pendingFileIds`, cap 200), `contentKey` (FNV-1a), `missingFileIds`, `isRemoteNewer`.
  - `src/config/membership.ts`: `MembershipTier` (free/pro), placeholder kotalar, `canAddPage`/`storageQuotaBytes` (local'da çağrılmaz, kilit yok), `canUseCloud`.
  - Testler: `tests/auth|storage|sync|membership.test.ts` (29 test; toplam 80/80).
  - YapılMAyan: ağ aktarımı, login ekranı, anonim→hesap taşıma modalı, billing — hesap geldikten sonra.
- **Faz 5 — billing altyapı dikişi:** (yapıldı, ağ yok, bekleme listesi UI yok).
  - `src/lib/billing.ts`: `BillingProvider` (`getStatus/checkout/openPortal/onBillingChange`) + `NoopBillingProvider` (checkout/portal açıkça reddeder), `getBilling/setBillingProvider` binding.
  - `src/config/membership.ts`: `FOUNDER_DISCOUNT_PCT` (%50) + `applyDiscount` (aşağı yuvarlar); `CalemUser.founder?` bayrağı.
  - Testler: `tests/billing.test.ts` + founder indirimi kilitleri.

## Bilerek yapılMAYacak
- Cookie/localStorage'a taşıma, backend kodu, kullanıcı hesabı (bu planda sadece dikişleri var).
- Davranış değişikliği yok — saf taşıma + test.
