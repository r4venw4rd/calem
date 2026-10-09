import { describe, expect, it } from 'vitest'
import {
  ANONYMOUS_OWNER,
  docOwner,
  namespaceFor,
  namespacedStorage,
  type DocStorage,
  type PersistedDoc,
} from '../src/lib/idb'

// Bellek-içi sahte depo: namespace öneki IDB'ye dokunmadan doğrulanır.
const memStorage = (): { storage: DocStorage; keys: Map<string, unknown> } => {
  const keys = new Map<string, unknown>()
  const files = new Map<string, { id: string }>()
  const storage: DocStorage = {
    getDoc: () => Promise.resolve(null),
    setDoc: () => Promise.resolve(),
    getKey: (k) => Promise.resolve((keys.get(k) as never) ?? null),
    setKey: (k, v) => {
      keys.set(k, v)
      return Promise.resolve()
    },
    getFile: (id) => Promise.resolve((files.get(id) as never) ?? null),
    setFile: (rec) => {
      files.set(rec.id, rec)
      return Promise.resolve()
    },
    getImage: () => Promise.resolve(null),
    setImage: () => Promise.resolve(),
    deleteFile: (id) => {
      files.delete(id)
      return Promise.resolve()
    },
  }
  return { storage, keys }
}

describe('owner + namespace', () => {
  it('docOwner: yoksa anonim', () => {
    const doc = { v: 5, savedAt: 1, pages: [] } as unknown as PersistedDoc
    expect(docOwner(doc)).toBe(ANONYMOUS_OWNER)
    expect(docOwner({ ...doc, ownerId: '' })).toBe(ANONYMOUS_OWNER)
    expect(docOwner({ ...doc, ownerId: 'u-1' })).toBe('u-1')
  })
  it('namespaceFor biçimi', () => {
    expect(namespaceFor('abc')).toBe('u:abc')
  })
  it('namespacedStorage: doc+ayar öneklenir, dosya global kalır', async () => {
    const { storage: base, keys } = memStorage()
    const ns = namespacedStorage('u:alice', base)
    await ns.setKey('settings', { v: 4 })
    await ns.setDoc({ v: 5, savedAt: 1, pages: [] } as unknown as PersistedDoc)
    expect(keys.has('u:alice:settings')).toBe(true)
    expect(keys.has('u:alice:default')).toBe(true)
    expect(keys.has('settings')).toBe(false)
    expect(await ns.getKey('settings')).toEqual({ v: 4 })
    // Dosyalar öneklenmez (içerik-adresli, paylaşılır).
    await ns.setFile({ id: 'f1', name: 'a', size: 1, addedAt: 1, pageCount: 1, bytes: new ArrayBuffer(1) })
    expect(await base.getFile('f1')).not.toBeNull()
  })
  it('iki kullanıcı izole, dosya ortak', async () => {
    const { storage: base } = memStorage()
    const a = namespacedStorage('u:a', base)
    const b = namespacedStorage('u:b', base)
    await a.setKey('settings', { who: 'a' })
    expect(await b.getKey('settings')).toBeNull()
    expect(await a.getKey('settings')).toEqual({ who: 'a' })
  })
})
