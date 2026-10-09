// Dosya adları, accept filtreleri, PWA yolu: indirme/kayıt UI'ı buradan beslenir.

/** Aktif sayfa PNG indirilirken. */
export const pngFileName = (d = new Date()): string =>
  `calem-${d.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`

/** Ayar yedeği indirilirken. */
export const settingsBackupName = (d = new Date()): string =>
  `calem-ayarlar-${d.toISOString().slice(0, 10)}.json`

/** PDF yazılırken. */
export const pdfFileName = (d = new Date()): string =>
  `calem-${d.toISOString().slice(0, 10)}.pdf`

/** .calem belgesi yazılırken. */
export const calemFileName = (d = new Date()): string =>
  `calem-${d.toISOString().slice(0, 10)}.calem`

export const PDF_ACCEPT = 'application/pdf,.pdf'
export const IMAGE_ACCEPT = 'image/*,.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg'
export const SETTINGS_ACCEPT = 'application/json,.json'
export const CALEM_ACCEPT = '.calem,application/json'

/** PWA service worker yolu (sadece production'da kayıt edilir). */
export const SERVICE_WORKER_PATH = '/service-worker.js'
