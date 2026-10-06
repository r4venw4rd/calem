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
  const lastPoint = ref({ x: 0, y: 0 })
  const points = ref<Point[]>([])
  const pressure = ref(1)
  const color = ref('#ffffff')
  const strokeWidth = ref(3)
  const currentTool = ref<Tool>('pen')
  const pressureSensitivity = ref(1)

  // Kalıcı geçmiş — yoktu, bu yüzden her bırakışta her şey siliniyordu
  const strokes = ref<Stroke[]>([])

  // Tool change
  const setTool = (tool: Tool) => {
    currentTool.value = tool
    if (tool === 'highlighter') {
      color.value = '#ffff00'
    }
  }

  // Color change
  const setColor = (col: string) => {
    color.value = col
  }

  // Stroke width change
  const setStrokeWidth = (w: number) => {
    strokeWidth.value = w
  }

  // Canvas ref setter — DİKKAT: burada width/height sıfırlama YAPMA.
  // canvas.width atamak canvas'ı temizler, o yüzden sadece mount/resize'da boyutlanır.
  const setCanvasRef = (canvas: HTMLCanvasElement | null) => {
    canvasRef.value = canvas
  }

  const getPos = (e: PointerEvent) => {
    const canvas = canvasRef.value!
    const rect = canvas.getBoundingClientRect()
    // CSS scale farkını hesaba kat (canvas.width != clientWidth olabilir)
    const scaleX = canvas.width / rect.width || 1
    const scaleY = canvas.height / rect.height || 1
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  // ✅ Başlat - basılı tutunca
  const startDrawing = (e: PointerEvent) => {
    if (!canvasRef.value) return
    isDrawing.value = true

    const { x, y } = getPos(e)
    lastPoint.value = { x, y }

    const p = e.pressure && e.pressure > 0 ? e.pressure : 1
    pressure.value = currentTool.value === 'highlighter' ? 0.8 : p
    points.value = [{ x, y, pressure: pressure.value }]
  }

  // ✅ Çek - hareket ederken smooth çizim
  const draw = (e: PointerEvent) => {
    if (!isDrawing.value || !canvasRef.value) return

    const { x, y } = getPos(e)
    const pressureVal = e.pressure && e.pressure > 0 ? e.pressure : 1
    pressure.value = pressureVal

    points.value.push({ x, y, pressure: pressureVal })
    lastPoint.value = { x, y }
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
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)'
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

  const paintStroke = (
    ctx: CanvasRenderingContext2D,
    s: Pick<Stroke, 'tool' | 'color' | 'width' | 'points'>,
  ) => {
    if (s.points.length === 0) return
    ctx.save()
    applyStyleForStroke(ctx, s.tool, s.color, s.width)
    strokePath(ctx, s.points)
    ctx.stroke()
    // Tek nokta ise dolgu da yap ki görünsün
    if (s.points.length === 1) {
      const p = s.points[0]!
      ctx.beginPath()
      ctx.arc(p.x, p.y, Math.max(s.width / 2, 1), 0, Math.PI * 2)
      ctx.fillStyle = s.tool === 'highlighter' ? 'rgba(255,255,0,0.5)' : s.color
      ctx.fill()
    }
    ctx.restore()
  }

  // ✅ Devam eden stroke'ı render et (incremental değil, tüm sahneyi tekrar çiz — yırtılma olmaz)
  const renderCurrentStroke = (ctx: CanvasRenderingContext2D) => {
    redraw(ctx)
  }

  // ✅ Tüm sahneyi render et: geçmiş + devam eden
  const redraw = (ctx: CanvasRenderingContext2D) => {
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.restore()

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
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)
      ctx.restore()
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

  // ✅ Pressure sensitivity ayarla
  const setPressureSensitivity = (val: number) => {
    pressureSensitivity.value = val
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

  // ✅ Canvas boyutlarını yeniden hesapla (boyut değişiminde geçmişi koru)
  const resizeCanvas = () => {
    if (!canvasRef.value) return
    const canvas = canvasRef.value
    // Mevcut içeriği sakla
    const tmp = document.createElement('canvas')
    tmp.width = canvas.width
    tmp.height = canvas.height
    const tmpCtx = tmp.getContext('2d')
    if (tmpCtx && canvas.width > 0 && canvas.height > 0) {
      tmpCtx.drawImage(canvas, 0, 0)
    }
    canvas.width = canvas.clientWidth
    canvas.height = canvas.clientHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (tmp.width > 0 && tmp.height > 0) {
      // Basit ölçekli geri çiz (vektör geçmişi de ayrıca duruyor)
      ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height)
    }
    // Vektör geçmişinden net redraw
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
    strokes,
    setTool,
    setColor,
    setStrokeWidth,
    setCanvasRef,
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
