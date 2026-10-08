# Calem → Xournal++ Parite Planı

> Hedef: Calem'i web'de çalışan bir Xournal++ yapmak.
> Tarih: 2026-10-09
> Kapsam: çizim motoru korunur (`sayfa-uzayı vektör + base/overlay` mimarisi), üstüne Xournal özellikleri eklenir.

## 0. Mevcut Durum (neyimiz var)

- Araçlar: `pen / highlighter / eraser`, renk paleti + damlalık, araç başına kalınlık (`src/stores/drawing.ts:273-282`).
- Sayfa: çok sayfa, `A4/A3/A5/Letter/custom + portrait/landscape` (`PAGE_FORMATS`, `defaultPageSize()`).
- View: contain-fit + `zoom/pan/pinch/ctrl-wheel` (`layoutView`, `zoomBy`, `panBy`, `pinch`).
- PDF: çok sayfalı import (pdf.js bitmap), raster export (PNG → jsPDF), kapat/geri yükle.
- Persist: IndexedDB `docs+files`, autosave debounce, `v1/v2` göç, ayarlar ayrı anahtarda (`src/lib/idb.ts`).
- UI: `CanvasView.vue` toolbar + `Dosya/Ayarlar` menüleri, HUD, oturum banner.
- Tema: UI chrome `koyu/acik` (`index.css` var'ları) + kâğıt rengi 3 flat hex (`PAPER_THEMES: gece/siyah/kagit`).

## 1. Gap Analizi (Xournal++'da var, bizde yok)

| # | Xournal özelliği | Calem durumu | Öncelik |
|---|------------------|--------------|---------|
| 1 | Kâğıt tipleri: düz/çizgili/kareli/noktalı/notalı, aralık+renk+marjin | Sadece flat `paper: string`, global. `paperFor()` + `paintPage()` dolgu yapıyor | **P0** |
| 2 | Seçim: lassso/dikdörtgen, taşı/kopyala/yapıştır/sil/yeniden boyutlandır | Yok | P0 |
| 3 | Şekiller: çizgi/dikdörtgen/elips/ok/yay + şekil tanıma | Yok | P1 |
| 4 | Metin kutusu, resim ekle, LaTeX | Yok | P1 |
| 5 | Katmanlar (per-page layers) | Tek `Page.strokes[]` | P1 |
| 6 | Silgi modları (stroke/standard/whiteout), kesikli çizgi, opaklık, dolgu | Tek silgi (kâğıt-boya / destination-out) | P2 |
| 7 | Sürekli dikey kaydırma, thumbnail şeridi, el (pan) aracı, tek-parmak kaydır | Tek sayfa contain-fit + `1/N` pager | P2 |
| 8 | Vektör `.xopp` kayıt + vektör PDF export (seçilebilir text) | Raster PNG→PDF, IDB blob | P2 |
| 9 | Özelleştirilebilir toolbar, kısayollar, stylus-only, sunum modu | Sabit toolbar, 2 kısayol | P3 |

## 2. Fazlar

### FAZ 1 — Kâğıt Teması (P0, ~ilk iş)
**Amaç:** flat renk → gerçek defter kâğıdı.

1.1. Veri modeli (`src/stores/drawing.ts`, `src/lib/idb.ts`):
- [ ] `PageBackground { type: 'blank'|'ruled'|'graph'|'dotted'|'staff', spacing: number, lineColor: string, margin: boolean, marginColor?: string }` tipi ekle.
- [ ] `Page.background?: PageBackground` ekle (yoksa global fallback).
- [ ] Global ayar: `paperColor + background (tip/spacing/lineColor/margin)` → `AppSettings v1 → v2` göçü (`loadSettings`, `importSettingsJSON`, `exportSettingsJSON`).
- [ ] Persist `PersistedDoc v2 → v3` göçü: eski `size` korunur, `background` default `blank` atanır (`pageSizeOf`, `cleanStrokes`, `loadPersisted`, `checkSavedSession`).

1.2. Render (`paintPage`, `exportPageToCanvas`):
- [ ] `paintPaperPattern(ctx, page)` helper: `fillRect(paperColor)` + tipe göre çizim, **sayfa-uzayında** (zoom/DPR'dan bağımsız, vektörler kıpırdamaz).
  - `ruled`: yatay çizgiler her `spacing` pt'de.
  - `graph`: yatay+dikey ızgara (ince + her 5'te bir kalın opsiyonel).
  - `dotted`: nokta grid'i (`arc` fill, `spacing`).
  - `staff`: 5'li porte grupları.
  - `margin`: dikey kırmızı çizgi (örn. x=72pt).
- [ ] `paintPage()` sırası: `kâğıt dolgu → pattern → PDF bitmap (varsa pattern çizilmez) → strokes`.
- [ ] PDF'li sayfada pattern yok (mevcut `paperFor() → null` kuralı korunur).
- [ ] Export aynı yolu kullanır (şu an `exportPageToCanvas` zaten `paintPage` çağırıyor — ek iş yok, sadece test).

1.3. UI (`src/views/CanvasView.vue` Ayarlar paneli ~L196):
- [ ] `Kâğıt teması` bölümü: renk dot'ları + tip select (`Boş/Çizgili/Kareli/Noktalı/Notalı`) + `aralık slider (12–48pt)` + `çizgi rengi input[type=color]` + `marjin checkbox`.
- [ ] `store.setPaperBackground(partial)` action: validate + `persistSettings()` + `repaintBase()`.
- [ ] Per-page vs global kararı: **v1'de global** (basit), per-page override Faz 5'te (katmanlarla birlikte).

1.4. Kabul:
- [ ] Tip/renk/aralık değişimi anında canvas + PNG/PDF export'a yansır.
- [ ] Reload sonrası ayar korunur (IDB).
- [ ] Zoom'da pattern kalınlığı sabit pt'de kalır (ekran-px'e şişmez).
- [ ] PDF sayfasında pattern çizilmez.

### FAZ 2 — Seçim / Taşıma (P0, en büyük fonksiyonel gap)
- [ ] `Tool: 'select-lasso' | 'select-rect'` ekle, `Stroke`'a `id` ekle.
- [ ] Hit-test: rect kesişim + lasso point-in-polygon (sayfa-uzayında).
- [ ] Seçim state: `selectedIds: Set<string>`, overlay'de kesikli bounding box + tutamaçlar.
- [ ] Op'lar: taşı (pointer drag), sil, kes/kopyala/yapıştır (sayfa-içi + sayfalar-arası), `Ctrl+A/C/X/V/Delete`, nudge (ok tuşları).
- [ ] Undo/redo seçim op'larını kapsar (mevcut `redoStack: Stroke[]` → op-based stack'e evrilir veya snapshot).
- Kabul: 1000 stroke içinde seçim <50ms, taşıma sonrası save/load tutarlı.

### FAZ 3 — Şekil Araçları (P1)
- [ ] `line / rect / ellipse / arrow` araçları, `Shift` ile oran kilidi.
- [ ] Önizleme overlay'de, commit base'e (mevcut `renderActiveStroke` deseni).
- [ ] `Stroke.style?: { dash?: number[], fill?: string, arrowHead?: boolean }`, `paintStroke()`'a dash/fill desteği.
- [ ] (Opsiyonel) şekil tanıma: el çizimini en yakın primitie snap'le.
- Kabul: şekiller export'ta vektör gibi keskin (raster'a rağmen kenar temiz).

### FAZ 4 — Metin / Resim (P1)
- [ ] `TextBox { id, x, y, text, font, size, color }` per-page, canvas üstü HTML overlay ile düzenleme, canvas'a `fillText` render.
- [ ] `ImageBox { id, x, y, w, h, blobId }`: ekle (file picker + drag-drop + paste), tutamaçla resize, IDB `files` store'da sakla (PDF bytes deseni).
- [ ] LaTeX: v1'de kapsam dışı — metin kutusuna MathJax render olarak ertele (P3).
- Kabul: metin/resim taşıma+silme seçimle çalışır, export'a dahil.

### FAZ 5 — Katmanlar (P1)
- [ ] `Page.layers: Layer[]`, `Layer { id, name, visible, locked, strokes[] }`, mevcut `strokes` → `layers[0]` göçü (`v3 → v4`).
- [ ] UI: katman paneli (göz/kilit, yukarı/aşağı, birleştir).
- [ ] `repaintBase`, `recountActive`, `cleanStrokes`, seçim — hepsi aktif katmana işler.
- Kabul: eski kayıtlar tek katmanlı açılır, veri kaybı yok.

### FAZ 6 — Silgi Modları + Çizgi Stili (P2)
- [ ] Silgi: `stroke-eraser` (dokunduğu stroke'u tümden siler) vs `standard` (mevcut) ayrımı.
- [ ] Stil: opaklık slider, kesikli (`solid/dash/dot`), highlighter alpha birleştirme düzeltmesi.
- [ ] Stabilizer (basit moving-average) opsiyonel.
- Kabul: stroke-eraser undo ile geri gelir.

### FAZ 7 — Sayfa UX / View (P2)
- [ ] El (pan) aracı + `Space+drag`, tek-parmak kaydır vs çift-parmak pinch ayrımı, stylus-only toggle (mevcut `rejectTouch` genişler).
- [ ] Dikey sürekli görünüm (mevcut contain-fit tek sayfa → scroll container, `layoutView` per-page).
- [ ] Thumbnail sidebar (küçük `exportPageToCanvas(0.2x)` cache).
- [ ] Sayfa op'ları: kopyala/çoğalt, başa/sona taşı, şablonla ekle.
- Kabul: 20 sayfa PDF'te scroll akıcı, aktif sayfa takibi doğru.

### FAZ 8 — Dosya Formatı (P2)
- [ ] `.calem` (JSON+assets zip) kaydet/aç: vektör strokes + text + image ref + background.
- [ ] Vektör PDF export: mürekkebi jsPDF `lines()` ile yaz, arkaplan bitmap'i alta göm (mevcut raster fallback dursun, ayarlanabilir `raster/vektör` seçeneği).
- Kabul: vektör PDF'te text seçilebilir, dosya boyutu raster'a göre <1/3.

### FAZ 9 — Toolbar / Polish (P3)
- [ ] Özelleştirilebilir toolbar (sürükle-sırala, preset kaydet — mevcut `exportSettingsJSON` genişler).
- [ ] Kısayollar: `P/E/H/S/T/L/R/O`, `Ctrl +/-/0`, `PgUp/PgDn`, `[ ]` kalınlık.
- [ ] Yüzen mini-toolbar + tam ekran/sunum modu.
- [ ] Eklenti kancası (Xournal plugin API'nin mini hali) — kapsam dışı sayılabilir.

## 3. Migration Zinciri

```
settings: v1 (mevcut) → v2 (+background)
doc:      v2 (mevcut) → v3 (+Page.background) → v4 (+layers, Faz 5)
```

Kurallar:
- Bilinmeyen alanları atma, `cleanStrokes`/`pageSizeOf` desenini koru.
- Her göçte eski kayıt tek sayfa/tek katman/blank kâğıt olarak açılır, mürekkep asla kaybolmaz.
- `checkSavedSession` yeni versiyonları tanır.

## 4. Test Stratejisi (her fazda)

- Mevcut saf kurallar (`needsPdfRerender`) gibi yeni saf helper'lar (`patternSpacing`, `hitTest`, `dashStyle`) unit-test edilebilir yazılır.
- Manuel checklist: çiz → reload → export (PNG+PDF) → undo/redo → sayfa geç.
- Perf HUD (`emaMs/frameMs`) regresyonu: Faz 2/7'de 1000+ stroke ile kontrol.

## 5. Önerilen Sıra (tıkanmamak için)

1. **Faz 1 (kâğıt)** — 1-2 gün, bağımsız, görsel kazanç büyük. ← buradan başla
2. Faz 2 (seçim) — en zor, ama Xournal hissi bununla gelir.
3. Faz 3+4 (şekil+metin/resim) — seçimin üstüne biner.
4. Faz 5 (katman) — veri modeli kırar, erken yapma.
5. Faz 6-9 — polish, sırayla.

## 6. Faz 1 Dosya Dokunuş Listesi

- `src/stores/drawing.ts`: `PAPER_THEMES` → `PaperColor + PaperBackground`, `Page`, `AppSettings`, `paintPage`, `setPaperBackground`, persist/göç.
- `src/views/CanvasView.vue`: Ayarlar paneli (L196-207 genişler), `PALETTE` yanına pattern UI.
- `src/lib/idb.ts`: `SETTINGS_KEY` versiyonlama, `PersistedDocV3` tipi.
- Yeni: `src/lib/paper.ts` (saf pattern hesapları — test edilebilir).

---
*Not: `paperFor()` PDF-şeffaf kuralı ve sayfa-uzayı değişmezi (resize'da nokta ölçeklenmez) tüm fazlarda korunur.*
