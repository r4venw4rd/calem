import type { UIKey } from './locale'
import type { DeviceProfile } from '../model/document'

// Cihaz profilleri: onboarding'de ve ayarlarda seçilen ön tanımlı girdi setleri.
// Kural: bir profil yalnızca GİRDİ ayarlarını (avuç reddi, dokunmayla kaydırma,
// parmak jestleri, basınç) uygular; diğer ayarlara dokunmaz.
//
// - stylus: kalemli PC/Chromebook — uygulamanın birincil hedefi.
//   Avuç reddi + dokunmayla kaydırma açık: kalem çizer, parmak kaydırır.
// - touch:  kalemsiz dokunmatik — parmak çizer, kaydırma el aracı/iki parmakla.
// - mouse:  normal PC (fare/trackpad) — dokunma yardımcıları devre dışı.
//
// Parmak jestleri (2 parmak geri al, 3 parmak ileri al) her profilde KAPALI gelir;
// kullanıcı isterse ayarlardan açar.
export interface DevicePreset {
  rejectTouch: boolean
  touchPan: boolean
  twoFingerTap: boolean
  threeFingerTap: boolean
  autoShapeSnap: boolean
  pressureSensitivity: number
}

export const DEVICE_PROFILE_IDS: DeviceProfile[] = ['stylus', 'touch', 'mouse']

export const DEVICE_PRESETS: Record<DeviceProfile, DevicePreset> = {
  stylus: {
    rejectTouch: true,
    touchPan: true,
    twoFingerTap: false,
    threeFingerTap: false,
    autoShapeSnap: true,
    pressureSensitivity: 1,
  },
  touch: {
    rejectTouch: false,
    touchPan: false,
    twoFingerTap: false,
    threeFingerTap: false,
    autoShapeSnap: true,
    pressureSensitivity: 1,
  },
  mouse: {
    rejectTouch: false,
    touchPan: false,
    twoFingerTap: false,
    threeFingerTap: false,
    autoShapeSnap: true,
    pressureSensitivity: 1,
  },
}

// Profil başına l10n anahtarları (locale sözlüğüyle birebir eşleşir).
export const DEVICE_PROFILE_META: Record<DeviceProfile, { labelKey: UIKey; descKey: UIKey }> = {
  stylus: { labelKey: 'devStylus', descKey: 'devStylusDesc' },
  touch: { labelKey: 'devTouch', descKey: 'devTouchDesc' },
  mouse: { labelKey: 'devMouse', descKey: 'devMouseDesc' },
}

export const isDeviceProfile = (v: unknown): v is DeviceProfile => v === 'stylus' || v === 'touch' || v === 'mouse'
