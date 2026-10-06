import { defineStore } from 'pinia'
import { ref } from 'vue'

export type Tool = 'pen' | 'eraser' | 'highlighter'
export interface Point { x: number; y: number; pressure?: number }
export interface Stroke {
  tool: Tool
  color: string
  width: number
  points: Point[]
}

export const useDrawingStore = defineStore('drawing', () => {
  const canvasRef = ref<HTMLCanvasElement | null>(null)
  const isDrawing = ref(false)
  const points = ref<Point[]>([])
  const pressure = ref(1)
  const color = ref('#ffffff')
  const strokeWidth = ref(3)
  const currentTool = ref<Tool>('pen')
  // 0 = basınç kapalı, 2 = çok hassas. UI slider'dan ayarlanır.
  const pressureSensitivity = ref(1)
  // Açıkken touch ile çizim engellenir (stylus + mouse serbest) — Chromebook avuç reddi.
  const rejectTouch = ref(false)
  // Backing-store ölçeği — noktalar CSS px cinsinden saklanır, render DPR ile ölçeklenir.
  // Böylece resize'da vektör geçmişi bozulmaz, hidpi'de bulanıklık olmaz.
  const dpr = ref(1)

  // Kalıcı geçmiş — yoktu, bu yüzden her bırakışta her şey siliniyordu
  const strokes = ref<Stroke[]>([])

  // Tool change — highlighter artık rengi ezmez, seçili renk alpha ile kullanılır.
  const setTool = (tool: Tool) => {
    currentTool.value = tool
  }

  // Color change
  const setColor = (col: string) => {
    color.value = col
  }

  // Stroke width change
  const setStrokeWidth = (w: number) => {
    strokeWidth.value = w
  }

  const setRejectTouch = (v: boolean) => {
    rejectTouch.value = v
  }

  const shouldIgnoreEvent = (e: PointerEvent): boolean => {
    if (rejectTouch.value && e.pointerType === 'touch') return true
    return false
  }

  // Canvas ref setter — DİKKAT: burada width/height sıfırlama YAPMA.
  // canvas.width atamak canvas'ı temizler, o yüzden sadece mount/resize'da boyutlanır.
  const setCanvasRef = (canvas: HTMLCanvasElement | null) => {
    canvasRef.value = canvas
  }

  const getDPR = () => Math.min(window.devicePixelRatio || 1, 3)

  // Backing store'u CSS boyut x DPR yap. Boyut değiştiyse true döner.
  const setupBackingStore = (): boolean => {
    const canvas = canvasRef.value
    if (!canvas) return false
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (w === 0 || h === 0) return false
    const scale = getDPR()
    dpr.value = scale
    const bw = Math.round(w * scale)
    const bh = Math.round(h * scale)
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw
      canvas.height = bh
      return true
    }
    return false
  }

  // İlk kurulum + resize için tek giriş noktası: boyutlandır ve vektörden redraw yap.
  const setupCanvas = () => {
    if (!canvasRef.value) return
    setupBackingStore()
    const ctx = canvasRef.value.getContext('2d')
    if (ctx) redraw(ctx)
  }

  const getPos = (e: PointerEvent) => {
    const canvas = canvasRef.value!
    const rect = canvas.getBoundingClientRect()
    // Noktalar CSS px cinsinden saklanır — DPR sadece render transform'unda uygulanır.
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  const readPressure = (e: PointerEvent): number => {
    // mouse her zaman 1; stylus/touch basıncı yoksa nötr 0.5 (çizgi kaybolmasın)
    if (e.pointerType === 'mouse') return 1
    if (e.pressure && e.pressure > 0) return e.pressure
    return 0.5
  }

  // ✅ Başlat - basılı tutunca. rejectTouch'ta touch yok sayılır.
  const startDrawing = (e: PointerEvent): boolean => {
    if (!canvasRef.value || isDrawing.value) return false
    if (shouldIgnoreEvent(e)) return false
    isDrawing.value = true

    const { x, y } = getPos(e)
    const p = readPressure(e)
    pressure.value = p
    points.value = [{ x, y, pressure: p }]
    return true
  }

  // ✅ Çek - hareket ederken smooth çizim
  const draw = (e: PointerEvent) => {
    if (!isDrawing.value || !canvasRef.value) return
    if (shouldIgnoreEvent(e)) return

    const { x, y } = getPos(e)
    const pressureVal = readPressure(e)
    pressure.value = pressureVal

    points.value.push({ x, y, pressure: pressureVal })
  }

  // ✅ Bitti — mevcut stroke'u geçmişe kaydet
  const stopDrawing = () => {
    if (isDrawing.value && points.value.length > 0) {
      strokes.value.push({
        tool: currentTool.value,
        color: color.value,
        width: strokeWidth.value,
        points: [...points.value],
      })
    }
    isDrawing.value = false
    points.value = []
  }

  const hexToRgba = (hex: string, alpha: number): string => {
    const h = hex.replace('#', '')
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
    const n = parseInt(full, 16)
    if (Number.isNaN(n)) return `rgba(255,255,0,${alpha})`
    const r = (n >> 16) & 255
    const g = (n >> 8) & 255
    const b = n & 255
    return `rgba(${r},${g},${b},${alpha})`
  }

  const applyStyleForStroke = (
    ctx: CanvasRenderingContext2D,
    tool: Tool,
    col: string,
    w: number,
  ) => {
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0, 0, 0, 1)'
      ctx.lineWidth = Math.max(w, 5)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.globalAlpha = 1
    } else if (tool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = hexToRgba(col, 0.5)
      ctx.lineWidth = Math.max(w * 2.5, 8)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.globalAlpha = 0.5
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = col
      ctx.lineWidth = Math.max(w, 1)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.globalAlpha = 0.95
    }
  }

  // ✅ Catmull-Rom spline ile smooth path (verilen noktalar için)
  const strokePath = (ctx: CanvasRenderingContext2D, pts: Point[]) => {
    if (pts.length === 1) {
      const p = pts[0]!
      // Tek nokta = nokta koy (tıklayıp bırakma durumu)
      ctx.beginPath()
      ctx.arc(p.x, p.y, 0.1, 0, Math.PI * 2)
      // arc tek başına stroke ile görünmez olabilir, o yüzden lineTo trick:
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x + 0.1, p.y + 0.1)
      return
    }
    if (pts.length < 2) return

    ctx.beginPath()
    const p0 = pts[0]!
    ctx.moveTo(p0.x, p0.y)

    for (let i = 0; i < pts.length - 1; i++) {
      const p0ref = i > 0 ? pts[i - 1]! : pts[i]!
      const p1 = pts[i]!
      const p2 = pts[i + 1]!
      const p3 = pts[i + 2] || p2

      const tension = 0.5
      const cp1x = p1.x + ((p2.x - p0ref.x) / 6) * tension
      const cp1y = p1.y + ((p2.y - p0ref.y) / 6) * tension
      const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension
      const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y)
    }
  }

  // Basınç ortalamasından efektif genişlik: sensitivity=0 → basınç yok sayılır.
  const effectiveWidth = (pts: Point[], base: number): number => {
    if (pressureSensitivity.value <= 0 || pts.length === 0) return base
    let sum = 0
    for (const p of pts) sum += p.pressure ?? 1
    const avg = sum / pts.length
    const pressureFactor = 0.4 + 0.6 * Math.min(Math.max(avg, 0), 1)
    const w = base * (1 + (pressureFactor - 1) * Math.min(pressureSensitivity.value, 2))
    return Math.max(w, 0.5)
  }

  const paintStroke = (
    ctx: CanvasRenderingContext2D,
    s: Pick<Stroke, 'tool' | 'color' | 'width' | 'points'>,
  ) => {
    if (s.points.length === 0) return
    ctx.save()
    const w = s.tool === 'eraser' ? s.width : effectiveWidth(s.points, s.width)
    applyStyleForStroke(ctx, s.tool, s.color, w)
    strokePath(ctx, s.points)
    ctx.stroke()
    // Tek nokta ise dolgu da yap ki görünsün
    if (s.points.length === 1) {
      const p = s.points[0]!
      ctx.beginPath()
      ctx.arc(p.x, p.y, Math.max(w / 2, 1), 0, Math.PI * 2)
      ctx.fillStyle = s.tool === 'highlighter' ? hexToRgba(s.color, 0.5) : s.color
      ctx.fill()
    }
    ctx.restore()
  }

  // ✅ Devam eden stroke'ı render et (incremental değil, tüm sahneyi tekrar çiz — yırtılma olmaz)
  const renderCurrentStroke = (ctx: CanvasRenderingContext2D) => {
    redraw(ctx)
  }

  // ✅ Tüm sahneyi render et: geçmiş + devam eden (CSS px uzayında, DPR transform ile)
  const redraw = (ctx: CanvasRenderingContext2D) => {
    const scale = dpr.value || getDPR()
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.clearRect(0, 0, ctx.canvas.width / scale, ctx.canvas.height / scale)

    for (const s of strokes.value) {
      paintStroke(ctx, s)
    }
    if (isDrawing.value && points.value.length > 0) {
      paintStroke(ctx, {
        tool: currentTool.value,
        color: color.value,
        width: strokeWidth.value,
        points: points.value,
      })
    }
  }

  // ✅ Canvası render et (dışarıdan çağrılan)
  const renderAllStrokes = (ctx: CanvasRenderingContext2D) => {
    redraw(ctx)
  }

  // ✅ Canvası temizle
  const clearCanvas = () => {
    strokes.value = []
    points.value = []
    isDrawing.value = false
    if (!canvasRef.value) return
    const ctx = canvasRef.value.getContext('2d')
    if (ctx) {
      const scale = dpr.value || getDPR()
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      ctx.clearRect(0, 0, canvasRef.value.width / scale, canvasRef.value.height / scale)
    }
  }

  // ✅ Görüntü verisi dışa aktar
  const exportDataURL = (): string => {
    if (!canvasRef.value) return ''
    return canvasRef.value.toDataURL('image/png')
  }

  // ✅ Görüntü verisi al
  const getImageData = (): ImageData => {
    if (!canvasRef.value) return new ImageData(1, 1)
    return (
      canvasRef.value?.getContext('2d')?.getImageData(0, 0, canvasRef.value.width, canvasRef.value.height) ||
      new ImageData(1, 1)
    )
  }

  // ✅ Pressure sensitivity ayarla (0..2 aralığına kelepçele)
  const setPressureSensitivity = (val: number) => {
    pressureSensitivity.value = Math.min(2, Math.max(0, val))
  }

  // ✅ Son stroke'u geri al (undo)
  const undoLastStroke = () => {
    strokes.value.pop()
    points.value = []
    isDrawing.value = false
    if (canvasRef.value) {
      const ctx = canvasRef.value.getContext('2d')
      if (ctx) redraw(ctx)
    }
  }

  // ✅ Canvas boyutlarını yeniden hesapla — vektör geçmişi CSS px olduğu için
  // bitmap kopyaya gerek yok, sadece backing store'u güncelle ve redraw yap.
  const resizeCanvas = () => {
    if (!canvasRef.value) return
    setupBackingStore()
    const ctx = canvasRef.value.getContext('2d')
    if (!ctx) return
    redraw(ctx)
  }

  return {
    canvasRef,
    isDrawing,
    pressure,
    color,
    strokeWidth,
    currentTool,
    pressureSensitivity,
    rejectTouch,
    strokes,
    dpr,
    setTool,
    setColor,
    setStrokeWidth,
    setRejectTouch,
    setCanvasRef,
    setupCanvas,
    startDrawing,
    draw,
    stopDrawing,
    renderCurrentStroke,
    renderAllStrokes,
    redraw,
    clearCanvas,
    exportDataURL,
    getImageData,
    setPressureSensitivity,
    undoLastStroke,
    resizeCanvas,
  }
})
