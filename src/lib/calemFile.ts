// .calem aktarım dosyası ve File System Access API dosya tutucuları.
import { B64_CHUNK } from '../config/engine'

export const bufToB64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += B64_CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + B64_CHUNK))
  }
  return btoa(s)
}

export const b64ToBuf = (b64: string): ArrayBuffer => {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out.buffer
}

export interface CalemWritable {
  write: (d: Blob) => Promise<void>
  close: () => Promise<void>
}

export interface CalemFileHandle {
  createWritable: () => Promise<CalemWritable>
  queryPermission?: (desc?: { mode?: string }) => Promise<PermissionState>
  requestPermission?: (desc?: { mode?: string }) => Promise<PermissionState>
}

export const ensureWritePermission = async (h: CalemFileHandle): Promise<boolean> => {
  try {
    if (typeof h.queryPermission === 'function') {
      if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true
    }
    if (typeof h.requestPermission === 'function') {
      return (await h.requestPermission({ mode: 'readwrite' })) === 'granted'
    }
    return true
  } catch {
    return false
  }
}

export const writeCalemToHandle = async (h: CalemFileHandle, blob: Blob): Promise<boolean> => {
  try {
    if (!(await ensureWritePermission(h))) return false
    const w = await h.createWritable()
    await w.write(blob)
    await w.close()
    return true
  } catch {
    return false
  }
}
