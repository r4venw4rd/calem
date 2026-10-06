import type { Stroke, Tool } from '../stores/drawing'

export interface PersistedDoc {
  v: 1
  savedAt: number
  strokes: Stroke[]
  widths?: Record<Tool, number>
}

const DB_NAME = 'calem'
const STORE_NAME = 'docs'
const KEY = 'default'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('idb open failed'))
  })
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE_NAME, mode)
        const req = fn(t.objectStore(STORE_NAME))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('idb request failed'))
      }),
  )
}

export function idbGet(): Promise<PersistedDoc | null> {
  return tx('readonly', (s) => s.get(KEY)).then((v) => (v as PersistedDoc | undefined) ?? null)
}

export function idbSet(doc: PersistedDoc): Promise<void> {
  return tx('readwrite', (s) => s.put(doc, KEY)).then(() => undefined)
}
