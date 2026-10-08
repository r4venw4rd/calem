import type { Page, Stroke, Tool } from '../stores/drawing'

export interface PersistedDocV1 {
  v: 1
  savedAt: number
  strokes: Stroke[]
  widths?: Record<Tool, number>
}

export interface PersistedDocV2 {
  v: 2
  savedAt: number
  pages: Page[]
  widths?: Record<Tool, number>
  activePageIndex?: number
  pdfId?: string
  pdfName?: string
}

// v3: sayfalara metin kutuları eklendi (texts yoksa boş sayılır, v2 göçer).
export interface PersistedDocV3 {
  v: 3
  savedAt: number
  pages: Page[]
  widths?: Record<Tool, number>
  activePageIndex?: number
  pdfId?: string
  pdfName?: string
}

export type PersistedDoc = PersistedDocV1 | PersistedDocV2 | PersistedDocV3

const DB_NAME = 'calem'
const DOCS_STORE = 'docs'
const FILES_STORE = 'files'
const KEY = 'default'
// v2: PDF bytes deposu eklendi (v1 kullanıcıları upgrade ile korunur).
const DB_VERSION = 2

export interface PdfFileRecord {
  id: string
  name: string
  size: number
  addedAt: number
  pageCount: number
  bytes: ArrayBuffer
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(DOCS_STORE)) db.createObjectStore(DOCS_STORE)
      if (!db.objectStoreNames.contains(FILES_STORE)) db.createObjectStore(FILES_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('idb open failed'))
  })
  return dbPromise
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = fn(t.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('idb request failed'))
      }),
  )
}

export function idbGet(): Promise<PersistedDoc | null> {
  return idbGetKey<PersistedDoc>(KEY)
}

export function idbSet(doc: PersistedDoc): Promise<void> {
  return idbSetKey(KEY, doc)
}

// Esnek ayar deposu (kâğıt, biçim, toolbar konumu… — Xournal-esnekliğinin zemini).
export const SETTINGS_KEY = 'settings'

export function idbGetKey<T>(key: string): Promise<T | null> {
  return tx(DOCS_STORE, 'readonly', (s) => s.get(key)).then((v) => (v as T | undefined) ?? null)
}

export function idbSetKey<T>(key: string, value: T): Promise<void> {
  return tx(DOCS_STORE, 'readwrite', (s) => s.put(value, key)).then(() => undefined)
}

export function idbGetFile(id: string): Promise<PdfFileRecord | null> {
  return tx(FILES_STORE, 'readonly', (s) => s.get(id)).then((v) => (v as PdfFileRecord | undefined) ?? null)
}

export function idbSetFile(rec: PdfFileRecord): Promise<void> {
  return tx(FILES_STORE, 'readwrite', (s) => s.put(rec, rec.id)).then(() => undefined)
}

export function idbDeleteFile(id: string): Promise<void> {
  return tx(FILES_STORE, 'readwrite', (s) => s.delete(id)).then(() => undefined)
}
