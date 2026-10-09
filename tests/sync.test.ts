import { describe, expect, it } from 'vitest'
import {
  ackOps,
  applyTombstones,
  contentKey,
  enqueueOp,
  isRemoteNewer,
  mergeDocuments,
  mergePages,
  mergeTombstones,
  missingFileIds,
  pendingFileIds,
  type SyncOp,
} from '../src/lib/sync'

describe('mergePages (sayfa LWW)', () => {
  it('yeni updatedAt kazanır, eski korunur', () => {
    const local = [{ id: 'a', updatedAt: 2 }]
    const remote = [{ id: 'a', updatedAt: 5 }]
    expect(mergePages(local, remote)).toEqual([{ id: 'a', updatedAt: 5 }])
    expect(mergePages(remote, local)).toEqual([{ id: 'a', updatedAt: 5 }])
  })
  it('eşitlikte local (flap yok)', () => {
    const l = [{ id: 'a', updatedAt: 5, v: 'l' }]
    const r = [{ id: 'a', updatedAt: 5, v: 'r' }]
    expect(mergePages(l, r)).toEqual([{ id: 'a', updatedAt: 5, v: 'l' }])
  })
  it('updatedAt yoksa 0 sayılır', () => {
    expect(mergePages([{ id: 'a' }], [{ id: 'a', updatedAt: 1 }])).toEqual([
      { id: 'a', updatedAt: 1 },
    ])
  })
  it('sıra deterministik: local sıra + yeni uzak sona', () => {
    const out = mergePages([{ id: 'b' }, { id: 'a' }], [{ id: 'c' }, { id: 'a', updatedAt: 9 }])
    expect(out.map((p) => p.id)).toEqual(['b', 'a', 'c'])
    expect(out.find((p) => p.id === 'a')).toMatchObject({ updatedAt: 9 })
  })
  it('bozuk girdiler atlanır', () => {
    const out = mergePages([{ id: 'a' }], [{ id: '' }, null, { noid: 1 }] as never[])
    expect(out).toEqual([{ id: 'a' }, { id: '' }])
  })
})

describe('tombstone', () => {
  it('birleşim: büyük deletedAt kazanır', () => {
    const out = mergeTombstones(
      [{ id: 'a', deletedAt: 3 }],
      [{ id: 'a', deletedAt: 7 }, { id: 'b', deletedAt: 1 }],
    )
    expect(out).toEqual([
      { id: 'a', deletedAt: 7 },
      { id: 'b', deletedAt: 1 },
    ])
  })
  it('uygulama: eski sayfa düşer, sonra yazılan dirilir', () => {
    const pages = [
      { id: 'old', updatedAt: 2 },
      { id: 'new', updatedAt: 9 },
      { id: 'kept' },
    ]
    const out = applyTombstones(pages, [
      { id: 'old', deletedAt: 5 },
      { id: 'new', deletedAt: 5 },
      { id: 'ghost', deletedAt: 5 },
    ])
    expect(out.map((p) => p.id)).toEqual(['new', 'kept'])
  })
  it('mergeDocuments uçtan uca', () => {
    const { pages, tombstones } = mergeDocuments(
      [{ id: 'a', updatedAt: 1 }],
      [{ id: 'a', updatedAt: 2 }, { id: 'b', updatedAt: 1 }],
      [],
      [{ id: 'b', deletedAt: 3 }],
    )
    expect(pages).toEqual([{ id: 'a', updatedAt: 2 }])
    expect(tombstones).toEqual([{ id: 'b', deletedAt: 3 }])
  })
})

describe('outbox', () => {
  const op = (id: string, kind: SyncOp['kind'], targetId: string, at = 1): SyncOp => ({
    id,
    kind,
    targetId,
    at,
  })
  it('aynı sayfa opu eskiyi ezer (upsert↔delete çapraz)', () => {
    let q: SyncOp[] = []
    q = enqueueOp(q, op('1', 'delete-page', 'p'))
    q = enqueueOp(q, op('2', 'upsert-page', 'p'))
    expect(q.map((o) => o.id)).toEqual(['2'])
    q = enqueueOp(q, op('3', 'delete-page', 'p'))
    expect(q.map((o) => o.id)).toEqual(['3'])
  })
  it('dosya opu sayfa opundan bağımsızdır', () => {
    let q: SyncOp[] = [op('1', 'upsert-page', 'x')]
    q = enqueueOp(q, op('2', 'put-file', 'x'))
    expect(q.map((o) => o.id)).toEqual(['1', '2'])
    q = enqueueOp(q, op('3', 'put-file', 'x'))
    expect(q.map((o) => o.id)).toEqual(['1', '3'])
  })
  it('cap taşınca en eski düşer, bozuk op yok sayılır', () => {
    let q: SyncOp[] = [op('1', 'upsert-page', 'a'), op('2', 'upsert-page', 'b')]
    q = enqueueOp(q, op('3', 'upsert-page', 'c'), 2)
    expect(q.map((o) => o.id)).toEqual(['2', '3'])
    expect(enqueueOp(q, null as never)).toBe(q)
  })
  it('ackOps + pendingFileIds', () => {
    const q: SyncOp[] = [
      op('1', 'put-file', 'f1'),
      op('2', 'put-file', 'f1'),
      op('3', 'upsert-page', 'p'),
    ]
    expect(pendingFileIds(q)).toEqual(['f1'])
    expect(ackOps(q, ['1', '3']).map((o) => o.id)).toEqual(['2'])
  })
})

describe('dosya + doküman', () => {
  it('contentKey deterministik ve ayırt edici', () => {
    const a = new Uint8Array([1, 2, 3])
    const b = new Uint8Array([1, 2, 3])
    const c = new Uint8Array([1, 2, 4])
    expect(contentKey(a)).toBe(contentKey(b))
    expect(contentKey(a)).not.toBe(contentKey(c))
    expect(contentKey(new Uint8Array([]))).toMatch(/^[0-9a-f]{8}$/)
  })
  it('missingFileIds', () => {
    expect(missingFileIds(['a', 'b'], ['b', 'c'])).toEqual(['a'])
    expect(missingFileIds([], ['a'])).toEqual([])
  })
  it('isRemoteNewer katı büyüktür', () => {
    expect(isRemoteNewer({ savedAt: 5 }, { savedAt: 6 })).toBe(true)
    expect(isRemoteNewer({ savedAt: 6 }, { savedAt: 6 })).toBe(false)
    expect(isRemoteNewer({ savedAt: 6 }, { savedAt: 5 })).toBe(false)
  })
})
