// PWA file_handlers (.calem) ile gelen dosya handle'ları için tek slotluk bekleme alanı.
// main.ts'teki launchQueue consumer'ı buraya koyar;
// CanvasView mount'ta tüketir + sıcak açılışlara abone olur.
export type LaunchHandle = FileSystemFileHandle

let pending: LaunchHandle | null = null
const listeners = new Set<() => void>()

export const pushLaunchHandle = (h: LaunchHandle) => {
  pending = h
  listeners.forEach((l) => l())
}

export const takeLaunchHandle = (): LaunchHandle | null => {
  const h = pending
  pending = null
  return h
}

export const onLaunchHandle = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
