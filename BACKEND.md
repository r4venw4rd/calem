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

## Bilerek yapılMAYacak
- Cookie/localStorage'a taşıma, backend kodu, kullanıcı hesabı (bu planda sadece dikişleri var).
- Davranış değişikliği yok — saf taşıma + test.
