<template>
  <div class="h-screen flex flex-col bg-gray-950 overflow-hidden">
    <header class="relative z-10 shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 bg-gray-900/90 backdrop-blur-sm border-b border-white/10">
      <div class="flex items-center gap-1 p-1 rounded-lg bg-white/5 border border-white/10" role="toolbar" aria-label="Araçlar">
        <button
          @click="store.setTool('pen')"
          :class="store.currentTool === 'pen' ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:text-white'"
          class="px-3 py-1 rounded text-xs font-medium transition flex items-center gap-1"
          title="Kalem"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7l7 9z" />
          </svg>
          Kalem
        </button>

        <button
          @click="store.setTool('highlighter')"
          :class="store.currentTool === 'highlighter' ? 'bg-yellow-500 text-black' : 'text-gray-300 hover:text-white'"
          class="px-3 py-1 rounded text-xs font-medium transition flex items-center gap-1"
          title="Vurgulayıcı"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 11l3 3m-2.5-2.5L4 17l5-1.5L19.5 5 15 3.5 9.5 8.5z" />
          </svg>
          Vurgu
        </button>

        <button
          @click="store.setTool('eraser')"
          :class="store.currentTool === 'eraser' ? 'bg-red-600 text-white' : 'text-gray-300 hover:text-white'"
          class="px-3 py-1 rounded text-xs font-medium transition flex items-center gap-1"
          title="Silgi"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.832A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.832L3 7m12 4h4m4-4v4m-4-6h4m-5.303-5.303L16 16" />
          </svg>
          Silgi
        </button>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-400">Renk:</span>
        <input
          type="color"
          :value="store.color"
          @input="store.setColor(($event.target as HTMLInputElement).value)"
          class="w-8 h-8 rounded bg-white/20 border border-white/30 cursor-pointer"
        />
      </div>

      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-400">Kalınlık:</span>
        <input
          type="range"
          min="1"
          max="20"
          :value="store.strokeWidth"
          @input="store.setStrokeWidth(Number(($event.target as HTMLInputElement).value))"
          class="w-24 accent-indigo-600"
        />
        <span class="text-xs text-gray-300 w-6 text-right">{{ store.strokeWidth }}</span>
      </div>

      <button
        @click="clearCanvas"
        class="px-3 py-1 rounded text-xs font-medium text-gray-300 hover:text-white transition flex items-center gap-1"
        title="Temizle"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.832A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.832L3 7m12 4h4m4-4v4m-4-6h4m-5.303-5.303L16 16" />
        </svg>
        Temizle
      </button>
    </header>

    <div class="relative flex-1 bg-gray-900/50 min-h-0">
      <canvas
        ref="canvas"
        class="absolute inset-0 w-full h-full cursor-crosshair touch-none select-none block"
        @pointerdown="startDraw"
        @pointermove="draw"
        @pointerup="endDraw"
        @pointerleave="endDraw"
        @pointercancel="endDraw"
      ></canvas>

      <p class="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-gray-500 pointer-events-none">
        Basılı tutun &amp; hareket edin - Smooth çizim
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useDrawingStore } from '@/stores/drawing'

const canvas = ref<HTMLCanvasElement | null>(null)
const store = useDrawingStore()
// Her pointermove'da full redraw yapma — frame başına en fazla 1 redraw (rAF throttle).
let rafId = 0

const getCtx = () => canvas.value?.getContext('2d') ?? null

const scheduleRender = () => {
  if (rafId !== 0) return
  rafId = requestAnimationFrame(() => {
    rafId = 0
    const ctx = getCtx()
    if (ctx) store.renderCurrentStroke(ctx)
  })
}

// Event handler'lar — template'teki @pointer* binding'leri yeterli.
// onMounted'da addEventListener EKLEME (yoksa her olay 2 kez ateşlenir).
const startDraw = (e: PointerEvent) => {
  if (!canvas.value) return
  // pointer capture ile canvas dışına taşınca bile çizmeye devam et
  try {
    canvas.value.setPointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
  store.startDrawing(e)
  scheduleRender()
}

const draw = (e: PointerEvent) => {
  if (!store.isDrawing) return
  // Sadece basılıyken çiz (pointermove hover'da ateşlenir)
  if (e.buttons === 0 && e.pointerType === 'mouse') return
  // coalesced events: birikmiş ara noktaları da işle, çizgi köşelenmesin
  const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e]
  for (const ev of events) store.draw(ev as PointerEvent)
  scheduleRender()
}

const endDraw = () => {
  if (!store.isDrawing) return
  if (rafId !== 0) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
  store.stopDrawing()
  const ctx = getCtx()
  if (ctx) store.renderAllStrokes(ctx)
}

const clearCanvas = () => {
  store.clearCanvas()
}

const sizeCanvas = () => {
  if (!canvas.value) return
  store.resizeCanvas()
}

// Canvas initialization
onMounted(() => {
  if (!canvas.value) return
  const c = canvas.value
  c.style.touchAction = 'none'

  store.setCanvasRef(c)
  // DPR-aware backing store + ilk redraw store üzerinden
  store.setupCanvas()

  window.addEventListener('resize', sizeCanvas)
})

onUnmounted(() => {
  if (rafId !== 0) cancelAnimationFrame(rafId)
  window.removeEventListener('resize', sizeCanvas)
  store.setCanvasRef(null)
})
</script>

<style scoped>
canvas {
  -webkit-tap-highlight-color: transparent;
  touch-action: none;
  user-select: none;
}
</style>
