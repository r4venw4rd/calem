import { describe, expect, it } from 'vitest'
import {
  ANONYMOUS_USER_ID,
  LocalAuthProvider,
  getAuth,
  getUser,
  setAuthProvider,
} from '../src/lib/auth'

describe('auth', () => {
  it('local: tek anonim kullanıcı', () => {
    const p = new LocalAuthProvider()
    expect(p.kind).toBe('local')
    const u = p.getUser()
    expect(u).toMatchObject({ id: ANONYMOUS_USER_ID, anonymous: true, provider: 'local' })
    expect(p.getUser()).toBe(u)
  })
  it('signIn/signOut anonimde kalır', async () => {
    const p = new LocalAuthProvider()
    const u = await p.signIn()
    expect(u.anonymous).toBe(true)
    await p.signOut()
    expect(p.getUser()?.anonymous).toBe(true)
    expect(p.getUser()?.id).toBe(ANONYMOUS_USER_ID)
  })
  it('onAuthChange anında + değişimde çağırır, unsubscribe keser', async () => {
    const p = new LocalAuthProvider()
    const seen: (string | null)[] = []
    const off = p.onAuthChange((u) => seen.push(u ? u.id : null))
    await p.signIn()
    off()
    await p.signOut()
    expect(seen).toEqual([ANONYMOUS_USER_ID, ANONYMOUS_USER_ID])
  })
  it('global binding değişir ve geri alınır', async () => {
    const prev = getAuth()
    const p = new LocalAuthProvider()
    setAuthProvider(p)
    expect(getAuth()).toBe(p)
    expect(getUser()?.id).toBe(ANONYMOUS_USER_ID)
    setAuthProvider(prev)
    expect(getAuth()).toBe(prev)
  })
})
