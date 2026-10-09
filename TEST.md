# Calem Test Şeması

Otomatik: `npm test` (vitest — `tests/` altında 85 test: paper/select/erase/config/membership/auth/storage/sync/billing).
Aşağıdakiler manuel/E2E şemasıdır. Her maddede **beklenen sonuç** yazar.

## 0. Kurulum
- `npm install`, `npm run dev` → http://127.0.0.1:5174 (temiz profil, IndexedDB boş).
- Her bölümden önce sayfayı yenile (taze durum), aksi belirtilmedikçe tek sayfa.

## 1. Çizim
| # | Adım | Beklenen |
|---|------|----------|
| 1.1 | Kalemle yatay çizgi çek | Kesintisiz mürekkep, HUD'da `1 çizgi`, nokta sayısı > 5 |
| 1.2 | Vurguyla üstünden geç | Yarı saydam sarı bant, alttaki çizgi görünür |
| 1.3 | Kalınlığı 20 yap, nokta koy (tıkla-bırak) | Kalın nokta belirir |
| 1.4 | Sayfa dışına taşarak çiz | Mürekkep sayfa kenarında kesilir, dışarı taşmaz |

## 2. Silgi
| # | Adım | Beklenen |
|---|------|----------|
| 2.1 | Standart silgiyle çizginin ortasından geç | Çizgi 2 parçaya bölünür (`2 çizgi`), arkaplan (desen) tertemiz |
| 2.2 | Çizgili kâğıtta sil | Silinen yerde çizgiler durur (kâğıt rengi leke yok) |
| 2.3 | PDF üstünde standart silgiyle sil | PDF metni/görseli delinmez, sadece mürekkep gider |
| 2.4 | Vuruş moduna al, çizgiye dokun | Çizgi tümden gider |
| 2.5 | Metin kutusunun üstünden sil (her iki mod) | Kutu gider |
| 2.6 | Silgi sonrası Ctrl+Z | Sürükleme tek hamlede geri gelir (tane tane değil) |

## 3. Seçim / taşıma / pano
| # | Adım | Beklenen |
|---|------|----------|
| 3.1 | Seç aracı + kare sürükle | Kesikli bbox + köşe tutamaçları |
| 3.2 | Kementle çevir | Sadece içinde noktası olanlar seçilir |
| 3.3 | Seçiliyi sürükle | Bütün seçili birlikte oynar, sayfada kalır |
| 3.4 | Ctrl+C → başka sayfa → Ctrl+V | Kopya yeni id'yle, hafif ötelenmiş gelir ve seçili olur |
| 3.5 | Del | Seçili gider; Ctrl+Z geri getirir |
| 3.6 | Ok tuşları (Shift ile) | 2pt (Shift: 10pt) dürtme |

## 4. Şekil + stil
| # | Adım | Beklenen |
|---|------|----------|
| 4.1 | Çizgi/Kare/Elips/Ok sürükle | Canlı önizleme, bırakınca primitif kalır |
| 4.2 | Kesikli + %50 opaklıkla çiz | Kesik, soluk çizgi |
| 4.3 | L/R/O/A/T/G kısayolları | İlgili araç aktif olur |

## 5. Metin / resim
| # | Adım | Beklenen |
|---|------|----------|
| 5.1 | Metin aracıyla boşa tıkla, yaz, Tamam | Metin canvas'a işlenir |
| 5.2 | Metne tıkla | İçerikle editör açılır |
| 5.3 | Metni sürükle | Kutu taşınır |
| 5.4 | Boş bırakıp kapat | Kutu çöpe gider (kayıtta boş metin kalmaz) |
| 5.5 | Resim aracıyla tıkla, PNG seç | Resim tıklanan noktaya ortalanır, panel açılır |
| 5.6 | Boyut sürgüsü + Sil | Oran korunarak büyür/küçülür; Sil kaldırır |
| 5.7 | Yeniden yükle | Metin + resim aynen geri gelir (IDB) |

## 6. Katman
| # | Adım | Beklenen |
|---|------|----------|
| 6.1 | Katman paneli → + Ekle, çiz | Yeni katman üstte, aktif olur |
| 6.2 | Gözü kapat | O katmanın mürekkebi gizlenir |
| 6.3 | Katman sil (mürekkepli) | Confirm sorar, siler; Ctrl+Z geri getirir |
| 6.4 | Yeniden yükle | Katmanlar + görünürlük korunur |

## 7. Kâğıt / sayfa / görünüm
| # | Adım | Beklenen |
|---|------|----------|
| 7.1 | Desen: çizgili/kareli/noktalı/notalı + marjin | Anında canvas'a yansır, PNG/PDF'e işlenir |
| 7.2 | Sayfa ekle/çoğalt/sola-sağa/sil | Sayaç doğru, undo sayfayı geri getirir |
| 7.3 | Şerit (2+ sayfa) | Thumbnail'ler güncel, tıklama gider, aktif halkalı |
| 7.4 | Kaydır modu aç | Sayfalar alt alta, aktifte çizim çalışır, tekerlek kaydırır |
| 7.5 | El aracı + Space-sürükle | Pan yapar, mürekkep bulaşmaz |
| 7.6 | Pinch / Ctrl+tekerlek | İmleç sabitli zoom, % etiketi güncellenir |

## 8. Undo / redo
| # | Adım | Beklenen |
|---|------|----------|
| 8.1 | Çiz → sil → taşı → metin → undo ×4 | Her hamle sırayla geri alınır |
| 8.2 | Undo sonrası yeni mürekkep | Redo ölür (Yinele pasif) |
| 8.3 | Sayfa değiştir → undo | Eski sayfadaki hamle geri alınır (global history) |
| 8.4 | Geri al düğmesi | History boşken pasif |

## 9. Toolbar
| # | Adım | Beklenen |
|---|------|----------|
| 9.1 | Ayarlar → araç gizle (örn. Kalem) | Düğme gider; yenilemede de yok (persist) |
| 9.2 | El'i en üste taşı | İlk düğme El olur |
| 9.3 | Sıfırla | Varsayılan sıra + tümü görünür |
| 9.4 | Sonuncuyu gizlemeye çalış | Engellenir (en az 1 araç kalır) |

## 10. Dosya
| # | Adım | Beklenen |
|---|------|----------|
| 10.1 | PDF aç (çok sayfalı) | Sayfalar PDF olur, mürekkep korunmaz uyarısı verir |
| 10.2 | Üstüne çiz → PDF Yaz | Vektör PDF: seçilebilir metin, keskin çizgi, küçük dosya |
| 10.3 | Standart silgi + PDF → PDF Yaz | Sayfa raster düşer ama PDF arkaplanı delinmez |
| 10.4 | Calem Kaydet → sıfırla → Calem Aç | Sayfalar + ayarlar + resimler aynen döner |
| 10.5 | Bozuk .calem aç | Hata mesajı, sahne korunur |

## 11. Tema / menü / sunum
| # | Adım | Beklenen |
|---|------|----------|
| 11.1 | Açık tema | Menü düğmeleri + select listeleri okunur (beyaz üstüne beyaz yok) |
| 11.2 | Menü açıkken dışarı tıkla / Esc | Menü kapanır, çizim etkilenmez |
| 11.3 | Sunum (F) | Fullscreen + sade chrome, sayaç + Çık; Esc çıkarır |
| 11.4 | Ayarlar modalı + backdrop tıkla | Ortalanmış pencere, kayar gövde; backdrop kapatır |
| 11.5 | Dokunmayla kaydır açıkken parmak sürükle | Ekran kayar, mürekkep bulaşmaz |
| 11.6 | Yeniden yükle | Tema + toolbar + kâğıt + smoothing + dokun-kaydır korunur |

## 12. Regresyon kapısı (her push öncesi)
- `npm run type-check` temiz, `npm run build-only` temiz, `npm test` 85/85.
