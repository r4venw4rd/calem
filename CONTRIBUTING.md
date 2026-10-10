# Katkı Rehberi

Calem'e hoş geldin. Offline-first, sıfır-gecikme çizim uygulaması — hız ve sadelik her şeyden önce gelir.

## Hızlı Başlangıç

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # vitest, hepsi yeşil olmalı
npm run type-check # PR öncesi zorunlu
```

## Kurallar

1. **Davranış değişikliği yoksa test kırma:** `npm test` (94 test) ve `npm run type-check` her committe yeşil.
2. **Yeni mantık = yeni test:** saf fonksiyonlar (`src/lib/`) `tests/`'e unit testle gelir. UI davranışı `TEST.md`'deki manuel şemaya satır olarak eklenir.
3. **Config tek kaynaktır:** limit/sabit/UI aralığı değişiyorsa `src/config/`'e dokun, `tests/config.test.ts` kilitler.
4. **Küçük PR:** bir PR bir iş. God-file'lara (`stores/drawing.ts`, `views/CanvasView.vue`) ekleme yapmadan önce `ARCHITECTURE.md`'ye bak — nereye ait olduğunu bul.
5. **Performans:** çizim yoluna (`pointermove` → boya) senkron boya ekleme; rAF desenini koru. Şüphede HUD'daki `emaMs/frameMs`'e bak.

## Branch + Commit

- Branch: `feature/kisa-isim`, `fix/kisa-isim`
- Commit (Türkçe, kısa): `fix(silgi): ...`, `feat(pan): ...`, `perf(cizim): ...`, `test: ...`, `docs: ...`

## PR Kontrol Listesi

- [ ] `npm test` yeşil
- [ ] `npm run type-check` temiz
- [ ] Yeni mantık testli / manuel şema güncelli
- [ ] Milisaniye kritik yolda senkron boya yok

Sorun mu var? Issue aç — cihaz + tarayıcı + adım adım tekrar yazman yeterli.
