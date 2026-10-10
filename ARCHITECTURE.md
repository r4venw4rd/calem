# Mimari

Calem tek sayfalık offline-first PWA: Vue 3 + Pinia + Canvas 2D + IndexedDB. Kural: **sayfa-uzayı vektör + base/overlay** — noktalar sayfa punto'sunda saklanır, resize/zoom asla noktayı ölçeklemez.

## Katmanlar

```
src/config/   Sabitler (tek kaynak): engine, tools, paper, palettes, ui, files, membership
src/lib/      Saf mantık (UI/store bağımsız, unit-testli): erase, select, paper, text, sync, auth, billing, idb
src/stores/   Pinia: orkestrasyon (hedef: ince katman — bkz. aşağıda "God-file borcu")
src/views/    CanvasView + paneller
```

> **God-file borcu (devam eden iş):** `stores/drawing.ts` (~4K satır) ve `views/CanvasView.vue`
> (~3.6K satır) henüz bölünmedi. Hedef: `src/model/` (tipler), `src/render/` (boyama),
> `src/persist/` (snapshot+IDB) — her dilim ayrı commit, davranış değişikliği sıfır.

## Veri Akışı

```
pointer/touch → CanvasSurface (preventDefault, jest kilidi)
  → store action (nokta topla, decimation)
  → rAF kuyruğu (frame başına tek boya)
  → overlay: aktif çizgi · base: commit'lenmiş mürekkep
pointerup → stopDrawing: base'e işle + history snapshot + debounce'lu IDB
```

Kritik yollar **senkron boya yapmaz** (pan dahil). Şüphede HUD'daki `emaMs/frameMs`'e bak.

## Dikişler (seams)

Dış servisler interface arkasında, ağ kodu yok — gerçek sağlayıcı aynı imzayla takılır:

| Dikiş | Interface | Varsayılan | Gerçek |
|---|---|---|---|
| Auth | `AuthProvider` (`lib/auth`) | `LocalAuthProvider` (anonim) | e-posta/OAuth sonradan |
| Depolama | `DocStorage` (`lib/idb`) | IDB adaptörü | kullanıcı-namespace'li |
| Senkron | saf kurallar (`lib/sync`) | outbox + sayfa-LWW | aktarım sonradan |
| Fatura | `BillingProvider` (`lib/billing`) | `NoopBillingProvider` | Polar/Stripe sonradan |

Yeni araç eklemek: `Tool` union'ına tip + `config/tools`'a meta + `lib/`'ye mantık — core'a dokunmadan kapanmalı (kapanmıyorsa mimari borçtur, issue aç).

## Göçler

- Ayar: `v1 → v4` (presence-check, versiyon şişirme yok).
- Doküman: `v2 → v5` (` PersistedDoc.v`). Kural: eski kayıt tek sayfa/tek katman/blank kâğıt açılır, **mürekkep asla kaybolmaz**.

Detaylı bulut planı: `BACKEND.md`. Xournal parite planı: `plan.md`.
