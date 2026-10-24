// jsPDF'in standart 14 fontu WinAnsi kodludur: ı İ ğ ş gibi harfler export'ta
// bozulur (ör. ı, kalın görünümlü '1' rakamına düşer — ç/ö/ü ise WinAnsi'de
// vardır, kullanıcı yalnız ı'nın bozulduğunu görür). Noto Sans subset bu yüzden
// BUILD'İN PARÇASI olarak gömülür: ayrı bir public fetch'i 404verse sessiz
// WinAnsi fallback'i tetiklenirdi. Hash'li asset olduğu için URL her ortamda
// doğrudur ve SW runtime-cache'ine düşer.

import notoSansSubsetUrl from '../assets/NotoSans-Regular-subset.ttf'
import type { PdfDoc } from './pdfExport'

const PDF_TEXT_FONT_FAMILY = 'NotoSans'

// Export başına bir fetch; session boyunca bir kez indirilir.
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
      fontBytes = fetch(notoSansSubsetUrl)
        .then((res) => {
          if (!res.ok) throw new Error(`font HTTP ${res.status}`)
          return res.arrayBuffer()
        })
        .then((buf) => new Uint8Array(buf))
    }
    const bytes = await fontBytes
    const b64 = bytesToBase64(bytes)
    doc.addFileToVFS(notoSansSubsetUrl, b64)
    doc.addFont(notoSansSubsetUrl, PDF_TEXT_FONT_FAMILY, 'normal')
    doc.setFont(PDF_TEXT_FONT_FAMILY, 'normal')
  } catch (e) {
    fontBytes = null // sonraki export tekrar denesin
    console.warn('[calem] PDF metin fontu yüklenemedi, WinAnsi düşülüyor:', e)
  }
}
