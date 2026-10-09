// Sync motoru tohumu: offline-first outbox + sayfa-seviyesi last-write-wins.
// Ağ kodu YOKTUR — sadece saf birleştirme kuralları. Aktarım (fetch/upload)
// sonradan bu kuralların üstüne takılır. tests/sync.test.ts kilitler.

/** Birleştirilebilir sayfa (gerçek Page'in alt kümesi; updatedAt yoksa 0 sayılır). */
export interface SyncablePage {
  id: string
  updatedAt?: number
}

/** Silinen sayfa işareti: tombstone'suz silme uzaktan dirilir (yeniden iner). */
export interface Tombstone {
  id: string
  deletedAt: number
}

const ts = (p: SyncablePage): number =>
  typeof p.updatedAt === 'number' && Number.isFinite(p.updatedAt) ? p.updatedAt : 0

/** Sayfa LWW: id'ye göre grupla, updatedAt büyük olan kazanır (eşitlikte local). */
export function mergePages<T extends SyncablePage>(local: T[], remote: T[]): T[] {
  const byId = new Map<string, T>()
  for (const p of local) {
    if (p && typeof p.id === 'string') byId.set(p.id, p)
  }
  for (const p of remote) {
    if (!p || typeof p.id !== 'string') continue
    const cur = byId.get(p.id)
    if (!cur || ts(p) > ts(cur)) byId.set(p.id, p)
  }
  // Sıra deterministik: local sıra korunur, yeni uzak sayfalar sona eklenir.
  const order = new Map<string, number>()
  local.forEach((p, i) => {
    if (p && typeof p.id === 'string' && !order.has(p.id)) order.set(p.id, i)
  })
  let next = local.length
  for (const p of remote) {
    if (p && typeof p.id === 'string' && !order.has(p.id)) order.set(p.id, next++)
  }
  return [...byId.values()].sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  )
}

/** Tombstone birleşimi: aynı id'de deletedAt büyük olan kazanır. */
export function mergeTombstones(local: Tombstone[], remote: Tombstone[]): Tombstone[] {
  const byId = new Map<string, Tombstone>()
  for (const t of [...local, ...remote]) {
    if (!t || typeof t.id !== 'string') continue
    const at =
      typeof t.deletedAt === 'number' && Number.isFinite(t.deletedAt) ? t.deletedAt : 0
    const cur = byId.get(t.id)
    if (!cur || at > cur.deletedAt) byId.set(t.id, { id: t.id, deletedAt: at })
  }
  return [...byId.values()]
}

/** Tombstone uygula: silme anından eski sayfalar düşer, sonra yazılan dirilir. */
export function applyTombstones<T extends SyncablePage>(pages: T[], tombs: Tombstone[]): T[] {
  const tombById = new Map<string, number>()
  for (const t of tombs) {
    if (t && typeof t.id === 'string') tombById.set(t.id, t.deletedAt)
  }
  return pages.filter((p) => {
    const del = tombById.get(p.id)
    return del === undefined || ts(p) > del
  })
}

/** Belge birleşimi: sayfa LWW + tombstone birliği + tombstone uygulaması. */
export function mergeDocuments<T extends SyncablePage>(
  localPages: T[],
  remotePages: T[],
  localTombs: Tombstone[] = [],
  remoteTombs: Tombstone[] = [],
): { pages: T[]; tombstones: Tombstone[] } {
  const tombstones = mergeTombstones(localTombs, remoteTombs)
  const pages = applyTombstones(mergePages(localPages, remotePages), tombstones)
  return { pages, tombstones }
}

// --- Outbox (offline-first kuyruk; ağ yok, sadece sıra kuralları) ---

export type SyncOpKind = 'upsert-page' | 'delete-page' | 'put-file'

export interface SyncOp {
  id: string
  kind: SyncOpKind
  /** Sayfa id'si ya da dosya id'si (içerik-adresli). */
  targetId: string
  at: number
}

/** Kuyruk cap'i: taşan en eski op düşer (kayıp değil — sayfa LWW ile toparlanır). */
export const OUTBOX_CAP = 200

const isPageOp = (k: SyncOpKind): boolean => k === 'upsert-page' || k === 'delete-page'

/** Kuyruğa ekle: aynı hedefte eski op ezilir (sayfa op'ları çapraz ezer,
 *  dosya op'ları kendi içinde tekillenir). Saf — girdiyi değiştirmez. */
export function enqueueOp(queue: SyncOp[], op: SyncOp, cap: number = OUTBOX_CAP): SyncOp[] {
  if (!op || typeof op.id !== 'string' || typeof op.targetId !== 'string') return queue
  let next = queue.filter((o) => {
    if (!o || o.targetId !== op.targetId) return true
    if (isPageOp(o.kind) && isPageOp(op.kind)) return false
    return o.kind !== op.kind
  })
  next = [...next, { ...op }]
  if (next.length > cap && cap > 0) next = next.slice(next.length - cap)
  return next
}

/** Onaylanan op'ları düş (upload sonrası ack). */
export function ackOps(queue: SyncOp[], ids: string[]): SyncOp[] {
  const done = new Set(ids)
  return queue.filter((o) => !done.has(o.id))
}

/** Kuyrukta bekleyen dosya id'leri (eksikse yükle kuralı için). */
export function pendingFileIds(queue: SyncOp[]): string[] {
  const out: string[] = []
  for (const o of queue) {
    if (o && o.kind === 'put-file' && !out.includes(o.targetId)) out.push(o.targetId)
  }
  return out
}

// --- İçerik-adresli dosya bytes (eksikse yükle) ---

/** FNV-1a 32-bit: küçük bytes için hızlı içerik anahtarı (sha yok, dikiş). */
export function contentKey(bytes: Uint8Array): string {
  let h = 0x811c9dc5
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!
    h = Math.imul(h, 0x01000193)
  }
  return ('0000000' + (h >>> 0).toString(16)).slice(-8)
}

/** Uzakta olmayıp local'de olan dosya id'leri (yüklenmesi gerekenler). */
export function missingFileIds(localIds: string[], remoteIds: string[]): string[] {
  const have = new Set(remoteIds)
  return localIds.filter((id) => typeof id === 'string' && !have.has(id))
}

/** Doküman kazananı: savedAt büyük olan (eşitlikte local — flap önlenir). */
export function isRemoteNewer(
  local: { savedAt: number },
  remote: { savedAt: number },
): boolean {
  const l = typeof local.savedAt === 'number' ? local.savedAt : 0
  const r = typeof remote.savedAt === 'number' ? remote.savedAt : 0
  return r > l
}
