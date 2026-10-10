// l10n: arayüz dili store.locale'dan beslenir, eksik anahtar Türkçe'ye düşer.
import { computed } from 'vue'
import { TOOL_LABELS, tr as trFn, type UIKey } from '@/config/locale'
import { useDrawingStore } from '@/stores/drawing'

export function useLocale() {
  const store = useDrawingStore()
  // Şablon anahtarları: {n} yer tutucusunu doldurur (örn. 'Sayfa {n} temizlensin mi?').
  const t = (k: UIKey): string => trFn(store.locale, k)
  const tf = (k: UIKey, n: number): string => t(k).replace('{n}', String(n))
  const locTools = computed(() => TOOL_LABELS[store.locale] ?? TOOL_LABELS.tr)
  return { t, tf, locTools }
}
