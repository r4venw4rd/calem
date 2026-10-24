// jsPDF'in standart 14 fontu WinAnsi kodludur: ı İ ğ Ğ ş Ş gibi Türkçe harfler
// export'ta bozulur. public/fonts'taki subset TTF gömülerek (Identity-H kodlama)
// hepsi kurtarılır. Font yalnız export sırasında, ağdan çekilerek yüklenir.

import type { PdfDoc } from './pdfExport'

// Göreli yol: uygulama hangi alt dizinde sunulursa oradan çözülür.
export const PDF_TEXT_FONT_URL = 'fonts/NotoSans-Regular-subset.ttf'
const PDF_TEXT_FONT_FAMILY = 'NotoSans'

// Export başına bir fetch; session boyunca bir kez indirilir (SW cache-first'e düşer).
let fontBytes: Promise<Uint8Array> | null = null

const bytesToBase64 = (bytes: Uint8Array): string => {
  // 32K'lık parçalar: String.fromCharCode'e tek seferde büyük dizi vermek stack'i patlatır.
  const CHUNK = 0x8000
  let bin = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

/**
 * Metin fontunu doc'a gömer ve aktif font yapar.
 * Sessiz başarısızlık: font gelmezse varsayılan WinAnsi fontuna düşülür
 * (bugünkü davranış) — export asla font yüzünden ölmemeli.
 */
export const ensurePdfTextFont = async (doc: PdfDoc): Promise<void> => {
  try {
    if (!fontBytes) {
      fontBytes = fetch(PDF_TEXT_FONT_URL)
        .then((res) => {
          if (!res.ok) throw new Error(`font HTTP ${res.status}`)
          return res.arrayBuffer()
        })
        .then((buf) => new Uint8Array(buf))
    }
    const bytes = await fontBytes
    const b64 = bytesToBase64(bytes)
    doc.addFileToVFS(PDF_TEXT_FONT_URL, b64)
    doc.addFont(PDF_TEXT_FONT_URL, PDF_TEXT_FONT_FAMILY, 'normal')
    doc.setFont(PDF_TEXT_FONT_FAMILY, 'normal')
  } catch (e) {
    fontBytes = null // sonraki export tekrar denesin
    console.warn('[calem] PDF metin fontu yüklenemedi, WinAnsi düşülüyor:', e)
  }
}
