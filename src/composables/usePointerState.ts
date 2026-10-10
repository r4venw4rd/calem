// Pointer jest durumu — CanvasView'daki dağınık pointer kitabını tek yerde toplar.
// Reactive DEĞİL (bilinçli): bu alanlar her pointermove'da dokunulur, Vue render
// döngüsü tetiklemeleri işe yaramaz. Overlay doğrudan çizilir (bkz. ARCHITECTURE.md).
//
// Sorumluluklar:
//  - Tek aktif pointer kilidi (avuç ikinci parmağı mevcut çizgiyi gasp edemez).
//  - İki parmak pinch takibi (mesafe + orta nokta) ve tüketim kilidi.
//  - Space-kaydırma modifier'ı (klavye → pointer dispeçi).

export interface PointerPos {
  x: number
  y: number
}

interface PinchGesture {
  d0: number
  mx0: number
  my0: number
}

// Pinch adımının store'a uygulanacak ölçek/merkez/delta çıktısı.
export interface PinchStep {
  scale: number
  midX: number
  midY: number
  dx: number
  dy: number
}

export function usePointerState() {
  let activeId: number | null = null
  let spacePan = false
  // Aşağıdaki tüm pointer'lar (pinch için) — id → son konum.
  const pointers = new Map<number, PointerPos>()
  let gesture: PinchGesture | null = null
  // İki parmak jesti bu oturumda bir kez başladı mı (parmaklar kalkana dek çizim kapalı).
  let consumed = false

  const positions = (): PointerPos[] => [...pointers.values()]

  return {
    // --- Aktif pointer kilidi ---
    activeId: () => activeId,
    setActive: (id: number) => {
      activeId = id
    },
    clearActive: () => {
      activeId = null
    },
    isActive: (id: number) => activeId === id,
    // Bayat olay: e veriliyse ve başka bir pointer aktifse true (yoksay).
    stale: (e?: PointerEvent) => e !== undefined && activeId !== null && e.pointerId !== activeId,

    // --- Space-kaydırma modifier ---
    spacePan: () => spacePan,
    setSpacePan: (on: boolean) => {
      spacePan = on
    },

    // --- Pointer havuzu (pinch) ---
    track: (id: number, p: PointerPos) => {
      pointers.set(id, p)
    },
    has: (id: number) => pointers.has(id),
    moveTracked: (id: number, p: PointerPos) => {
      const cur = pointers.get(id)
      if (!cur) return false
      cur.x = p.x
      cur.y = p.y
      return true
    },
    count: () => pointers.size,
    positions,
    clearPointers: () => {
      pointers.clear()
    },

    // --- Pinch jesti ---
    // İki parmak inince çağrılır: başlangıç mesafesi + orta nokta saklanır, kilit açılır.
    beginGesture: () => {
      const [a, b] = positions() as [PointerPos, PointerPos]
      gesture = {
        d0: Math.hypot(a.x - b.x, a.y - b.y),
        mx0: (a.x + b.x) / 2,
        my0: (a.y + b.y) / 2,
      }
      consumed = true
    },
    // İki parmak hazırken çağrılır: bir önceki çerçeveye göre ölçek/merkez/delta döner.
    // Jest yoksa null (çağırıcı normal araç yoluna devam eder).
    stepGesture: (): PinchStep | null => {
      if (!gesture || pointers.size < 2) return null
      const [a, b] = positions() as [PointerPos, PointerPos]
      const d1 = Math.hypot(a.x - b.x, a.y - b.y)
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      const step: PinchStep = {
        scale: gesture.d0 > 0 ? d1 / gesture.d0 : 0,
        midX: mx,
        midY: my,
        dx: mx - gesture.mx0,
        dy: my - gesture.my0,
      }
      gesture = { d0: d1, mx0: mx, my0: my }
      return step
    },
    // Gesture (veya artığı) hâlâ aktifken çizim kapalıdır — çağırıcı erken dönmeli.
    gestureLocked: () => gesture !== null || consumed,
    // Pointer kalktı: havuzdan düş, kilit durumunu güncelle.
    // Dönen true = jest bitmedi, çağırıcı beklemeli (arta kalan parmak çizmesin).
    releasePointer: (id?: number): boolean => {
      if (id !== undefined) pointers.delete(id)
      if (pointers.size === 0) {
        gesture = null
        consumed = false
      }
      if (gesture !== null || consumed) {
        if (gesture !== null && pointers.size < 2) gesture = null
        return true
      }
      return false
    },
    clearGesture: () => {
      gesture = null
    },
  }
}

export type PointerState = ReturnType<typeof usePointerState>
