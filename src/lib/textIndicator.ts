/**
 * Live Text Input (Paint-style)
 * 
 * Text tool click → Dashed border kutu sabit kalır
 * Kutu ALTında HTML textarea açılır
 * Yazılan metin hem textarea'ya hem canvas kutuya yazılır
 * (Paint text tool gibi)
 */

import { computed, ref, reactive, watch, nextTick } from 'vue'

export interface TextInputState {
  x: number
  y: number
  fontSize: number
  color: string
  isActive: boolean
  currentText: string
  canvasScale: number
  canvasOffsetX: number
  canvasOffsetY: number
  padding: number
  initialWidth: number
  initialHeight: number
  lineHeight: number
}

/**
 * Text input manager - Paint-style text box
 */
export class TextInputManager {
  private state = reactive<TextInputState>({
    x: 0,
    y: 0,
    fontSize: 16,
    color: '#000000',
    isActive: false,
    currentText: '',
    canvasScale: 1,
    canvasOffsetX: 0,
    canvasOffsetY: 0,
    padding: 8,
    initialWidth: 200,
    initialHeight: 60,
    lineHeight: 1.4,
  })

  private inputElement: HTMLTextAreaElement | null = null

  /**
   * Text input başlat
   */
  startEditing(
    x: number,
    y: number,
    fontSize: number,
    color: string,
  ) {
    this.state.x = x
    this.state.y = y
    this.state.fontSize = fontSize
    this.state.color = color
    this.state.currentText = ''
    this.state.isActive = true
  }

  /**
   * Editing'i bitir
   */
  stopEditing(): string {
    this.state.isActive = false
    return this.state.currentText
  }

  /**
   * Canvas transform bilgilerini set et
   */
  setCanvasTransform(scale: number, offsetX: number, offsetY: number) {
    this.state.canvasScale = scale
    this.state.canvasOffsetX = offsetX
    this.state.canvasOffsetY = offsetY
  }

  /**
   * Metin güncelle (typing sırasında)
   */
  setText(text: string) {
    this.state.currentText = text
  }

  /**
   * State getir
   */
  getState() {
    return this.state
  }

  /**
   * Input element'i set et
   */
  setInputElement(el: HTMLTextAreaElement | null) {
    this.inputElement = el
  }

  /**
   * Input'a focus ver
   */
  focusInput() {
    nextTick(() => {
      if (this.inputElement) {
        this.inputElement.focus()
      }
    })
  }

  /**
   * Metni ölç (width hesabı için)
   */
  private measureTextWidth(ctx: CanvasRenderingContext2D, text: string): number {
    const lines = text.split('\n')
    let maxWidth = 0
    for (const line of lines) {
      const metrics = ctx.measureText(line)
      maxWidth = Math.max(maxWidth, metrics.width)
    }
    return maxWidth
  }

  /**
   * Canvas'a text box'ı çiz (sabit boyut + dashed border)
   */
  drawTextBox(ctx: CanvasRenderingContext2D, pageScale: number) {
    if (!this.state.isActive) return

    const x = this.state.canvasOffsetX + this.state.x * pageScale
    const y = this.state.canvasOffsetY + this.state.y * pageScale
    const w = this.state.initialWidth * pageScale
    const h = this.state.initialHeight * pageScale

    ctx.save()

    // Box background (hafif indigo)
    ctx.fillStyle = 'rgba(99, 102, 241, 0.08)'
    ctx.fillRect(x, y, w, h)

    // Dashed border (indigo)
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.7)'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.strokeRect(x, y, w, h)

    // Metin çiz (line by line)
    ctx.fillStyle = this.state.color
    ctx.font = `${this.state.fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
    ctx.textBaseline = 'top'

    const lines = this.state.currentText.split('\n')
    const lineHeight = this.state.fontSize * this.state.lineHeight
    const textX = x + this.state.padding * pageScale
    let textY = y + this.state.padding * pageScale

    for (const line of lines) {
      if (textY > y + h) break
      ctx.fillText(line, textX, textY, w - this.state.padding * 2 * pageScale)
      textY += lineHeight * pageScale
    }

    // Cursor çiz (aktif yazarken)
    if (this.state.isActive && this.state.currentText) {
      const lastLine = lines[lines.length - 1] || ''
      const cursorX = textX + ctx.measureText(lastLine).width
      const cursorY = y + (lines.length - 1) * lineHeight * pageScale + this.state.padding * pageScale

      ctx.strokeStyle = this.state.color
      ctx.lineWidth = 2
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(cursorX, cursorY)
      ctx.lineTo(cursorX, cursorY + this.state.fontSize * pageScale)
      ctx.stroke()
    } else if (this.state.isActive) {
      // Boş input'ta cursor (başlangıç)
      const cursorX = x + this.state.padding * pageScale
      const cursorY = y + this.state.padding * pageScale

      ctx.strokeStyle = this.state.color
      ctx.lineWidth = 2
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(cursorX, cursorY)
      ctx.lineTo(cursorX, cursorY + this.state.fontSize * pageScale)
      ctx.stroke()
    }

    ctx.restore()
  }

  /**
   * HTML textarea'nın CSS pozisyonunu hesapla (box ALTında)
   */
  getInputPosition(canvasElement: HTMLCanvasElement): {
    left: number
    top: number
    width: number
    height: number
  } {
    const rect = canvasElement.getBoundingClientRect()
    const screenX =
      rect.left +
      this.state.canvasOffsetX +
      this.state.x * this.state.canvasScale
    const screenY =
      rect.top +
      this.state.canvasOffsetY +
      (this.state.y + this.state.initialHeight) * this.state.canvasScale +
      8 // Box altında 8px boşluk

    return {
      left: screenX,
      top: screenY,
      width: this.state.initialWidth * this.state.canvasScale,
      height: 40,
    }
  }
}

/**
 * Vue Composable: Paint-style text input
 */
export function useLiveTextInput() {
  const manager = new TextInputManager()
  const textInputRef = ref<HTMLTextAreaElement>()
  const canvasRef = ref<HTMLCanvasElement>()

  const isEditing = computed(() => manager.getState().isActive)
  const currentText = computed(() => manager.getState().currentText)

  const startEditing = (
    x: number,
    y: number,
    fontSize: number,
    color: string,
  ) => {
    manager.startEditing(x, y, fontSize, color)
    nextTick(() => manager.focusInput())
  }

  const finishEditing = (): string => {
    return manager.stopEditing()
  }

  const updateText = (text: string) => {
    manager.setText(text)
  }

  const setCanvasTransform = (scale: number, offsetX: number, offsetY: number) => {
    manager.setCanvasTransform(scale, offsetX, offsetY)
  }

  // Input element'i track et
  watch(textInputRef, (newEl) => {
    if (newEl) {
      manager.setInputElement(newEl)
    }
  })

  // Input pozisyonunu güncelle
  const getInputStyle = computed(() => {
    if (!canvasRef.value || !isEditing.value) return {}
    const pos = manager.getInputPosition(canvasRef.value)
    return {
      left: `${pos.left}px`,
      top: `${pos.top}px`,
      width: `${pos.width}px`,
      height: `${pos.height}px`,
    }
  })

  return {
    manager,
    textInputRef,
    canvasRef,
    isEditing,
    currentText,
    getInputStyle,
    startEditing,
    finishEditing,
    updateText,
    setCanvasTransform,
  }
}

/**
 * Kullanım (CanvasView.vue):
 * 
 * ```vue
 * <template>
 *   <div class="relative">
 *     <canvas 
 *       ref="canvasRef"
 *       @click="onCanvasClick"
 *       @mousemove="onCanvasMouseMove"
 *     ></canvas>
 *     
 *     <!-- HTML textarea (box altında, paint style) -->
 *     <textarea
 *       v-if="isEditing"
 *       ref="textInputRef"
 *       v-model.trim="currentText"
 *       :style="getInputStyle"
 *       class="absolute p-2 border-2 border-indigo-500 rounded bg-white/90 shadow-lg resize-none font-mono text-sm"
 *       @blur="onTextInputBlur"
 *       @keydown.escape="onTextInputCancel"
 *     />
 *   </div>
 * </template>
 * 
 * <script setup lang="ts">
 * import { ref } from 'vue'
 * import { useLiveTextInput } from '@/lib/textInputManager'
 * 
 * const {
 *   manager,
 *   textInputRef,
 *   canvasRef,
 *   isEditing,
 *   currentText,
 *   getInputStyle,
 *   startEditing,
 *   finishEditing,
 *   updateText,
 *   setCanvasTransform,
 * } = useLiveTextInput()
 * 
 * const canvas = ref<HTMLCanvasElement>()
 * let pageScale = 1
 * let pageOffsetX = 0
 * let pageOffsetY = 0
 * 
 * function onCanvasClick(e: MouseEvent) {
 *   if (store.currentTool !== 'text') return
 *   
 *   const rect = canvas.value!.getBoundingClientRect()
 *   const screenX = e.clientX - rect.left
 *   const screenY = e.clientY - rect.top
 *   
 *   // Page koordinatlarına dönüştür
 *   const pageX = (screenX - pageOffsetX) / pageScale
 *   const pageY = (screenY - pageOffsetY) / pageScale
 *   
 *   // Text input başlat
 *   startEditing(pageX, pageY, store.textSize, store.textColor)
 *   setCanvasTransform(pageScale, pageOffsetX, pageOffsetY)
 *   
 *   renderCanvas()
 * }
 * 
 * function onCanvasMouseMove() {
 *   if (!isEditing.value) return
 *   renderCanvas()
 * }
 * 
 * function renderCanvas() {
 *   const ctx = canvas.value!.getContext('2d')!
 *   // ... page çiz ...
 *   manager.drawTextBox(ctx, pageScale)
 * }
 * 
 * function onTextInputBlur() {
 *   const text = finishEditing()
 *   if (text) {
 *     store.addTextItem({
 *       id: crypto.randomUUID(),
 *       x: manager.getState().x,
 *       y: manager.getState().y,
 *       text,
 *       color: store.textColor,
 *       size: store.textSize,
 *     })
 *   }
 *   renderCanvas()
 * }
 * 
 * function onTextInputCancel() {
 *   finishEditing()
 *   renderCanvas()
 * }
 * </script>
 * ```
 */



