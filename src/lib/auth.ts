// Auth dikişi: hesap gelmeden önceki arayüz. Gerçek sağlayıcılar (e-posta+şifre,
// OAuth/Google) aynı imzayla takılır; local üçüncü sağlayıcı olarak kalır.
// Login ekranı YOKTUR — sadece dikiş + anonim akış. Davranış değişikliği yok.

import type { MembershipTier } from '../config/membership'
import { DEFAULT_TIER } from '../config/membership'

/** Calem kullanıcısı (bulut kimliği; local'da tek anonim satır). */
export interface CalemUser {
  id: string
  anonymous: boolean
  provider: string
  email?: string
  tier: MembershipTier
}

export type AuthListener = (user: CalemUser | null) => void

/** Gerçek auth'un takılacağı imza (hepsi async; local senkron döner). */
export interface AuthProvider {
  readonly kind: string
  getUser(): CalemUser | null
  signIn(): Promise<CalemUser>
  signOut(): Promise<void>
  onAuthChange(cb: AuthListener): () => void
}

// Anonim local kimliği: kullanıcı-scoped depolama buradan namespace üretir.
export const ANONYMOUS_USER_ID = 'local-anon'

const anonUser = (): CalemUser => ({
  id: ANONYMOUS_USER_ID,
  anonymous: true,
  provider: 'local',
  tier: DEFAULT_TIER,
})

/** Varsayılan sağlayıcı: tek anonim local kullanıcı (login yok, ağ yok). */
export class LocalAuthProvider implements AuthProvider {
  readonly kind = 'local'
  private user: CalemUser | null = null
  private listeners = new Set<AuthListener>()

  getUser(): CalemUser | null {
    if (!this.user) {
      this.user = anonUser()
    }
    return this.user
  }

  async signIn(): Promise<CalemUser> {
    this.user = anonUser()
    this.emit()
    return this.user
  }

  async signOut(): Promise<void> {
    // Local'da oturum kapatma = anonimde kal (veri silinmez, kullanıcı düşmez).
    this.user = anonUser()
    this.emit()
  }

  onAuthChange(cb: AuthListener): () => void {
    this.listeners.add(cb)
    // Abone anında mevcut durumu alır (açılışta tek okuma yeterli).
    cb(this.getUser())
    return () => {
      this.listeners.delete(cb)
    }
  }

  private emit(): void {
    for (const cb of this.listeners) {
      try {
        cb(this.user)
      } catch {
        /* dinleyici hatası auth'u devirmez */
      }
    }
  }
}

// Aktif sağlayıcı (canlı binding — gerçek auth setAuthProvider ile takılır).
let active: AuthProvider = new LocalAuthProvider()

export const getAuth = (): AuthProvider => active
export const setAuthProvider = (p: AuthProvider): void => {
  active = p
}
export const getUser = (): CalemUser | null => active.getUser()
