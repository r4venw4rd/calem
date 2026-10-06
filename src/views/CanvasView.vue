<template>
  <div class="h-screen flex flex-col bg-gray-950 overflow-hidden">
    <header class="relative z-10 shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 bg-gray-900 border-b border-white/10">
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
          :min="store.widthMin"
          :max="store.widthMax"
          :value="store.strokeWidth"
          @input="store.setStrokeWidth(Number(($event.target as HTMLInputElement).value))"
          class="w-24 accent-indigo-600"
        />
        <span class="text-xs text-gray-300 w-6 text-right">{{ store.strokeWidth }}</span>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-400">Basınç:</span>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          :value="store.pressureSensitivity"
          @input="store.setPressureSensitivity(Number(($event.target as HTMLInputElement).value))"
          class="w-20 accent-indigo-600"
          title="0=kapalı, 2=çok hassas"
        />
      </div>

      <label class="flex items-center gap-1 text-xs text-gray-400 cursor-pointer" title="Açıkken parmakla çizim engellenir">
        <input
          type="checkbox"
          :checked="store.rejectTouch"
          @change="store.setRejectTouch(($event.target as HTMLInputElement).checked)"
          class="accent-indigo-600"
        />
        Avuç reddi
      </label>

      <button
        @click="undo"
        :disabled="store.strokes.length === 0"
        class="px-3 py-1 rounded text-xs font-medium text-gray-300 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
        title="Geri al (Ctrl+Z)"
      >
        Geri al
      </button>

      <button
        @click="redo"
        :disabled="store.redoStack.length === 0"
        class="px-3 py-1 rounded text-xs font-medium text-gray-300 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
        title="Yinele (Ctrl+Y / Ctrl+Shift+Z)"
      >
        Yinele
      </button>

      <button
        @click="exportPng"
        class="px-3 py-1 rounded text-xs font-medium text-gray-300 hover:text-white transition"
        title="PNG indir"
      >
        PNG
      </button>

      <span
        v-if="store.lastSavedAt"
        class="text-[10px] text-gray-500 font-mono"
        title="Otomatik kayıt (IndexedDB)"
      >
        kayıtlı {{ store.lastSavedAt }}
      </span>

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
      <!-- Alt katman: commit'lenmiş stroke'lar. Üst katman: aktif çizgi (pointer burada). -->
      <canvas
        ref="baseCanvas"
        class="absolute inset-0 w-full h-full block"
      ></canvas>
      <canvas
        ref="overlayCanvas"
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
      <!-- Perf HUD: reaktivite dışı güncellenir (kendisi render tetiklemez) -->
      <div
        ref="hud"
        class="absolute bottom-2 right-2 text-[10px] leading-tight text-gray-500 bg-black/40 rounded px-1.5 py-0.5 pointer-events-none font-mono"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { drawingPerf, useDrawingStore } from '@/stores/drawing'

const baseCanvas = ref<HTMLCanvasElement | null>(null)
const overlayCanvas = ref<HTMLCanvasElement | null>(null)
const hud = ref<HTMLDivElement | null>(null)
const store = useDrawingStore()
// Her pointermove'da overlay redraw yapma — frame başına en fazla 1 (rAF throttle).
let rafId = 0
let lastHudAt = 0
let lastFrameAt = 0

const fmtPts = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`)

// Doğrudan DOM yazımı — reactive state'e dokunmaz, render döngüsü tetiklemez.
const updateHud = (force = false) => {
  const el = hud.value
  if (!el) return
  const now = performance.now()
  if (!force && now - lastHudAt < 250) return
  lastHudAt = now
  el.textContent =
    `${drawingPerf.emaMs.toFixed(1)}/${drawingPerf.frameMs.toFixed(0)}ms` +
    ` · ${store.drawingCount} çizgi` +
    ` · ${fmtPts(store.activePoints())}+${fmtPts(drawingPerf.totalPoints)}`
}

const scheduleRender = () => {
  if (rafId !== 0) return
  rafId = requestAnimationFrame(() => {
    rafId = 0
    // Duvar-saati frame aralığı: JS + GPU + kompozit + dev vergisi hepsi dahil.
    // JS süresi (emaMs) düşük ama bu yüksekse suç canvas dışında.
    const now = performance.now()
    if (lastFrameAt !== 0) {
      const dt = now - lastFrameAt
      if (dt > 0 && dt < 250) {
        drawingPerf.frameMs = drawingPerf.frameMs === 0 ? dt : drawingPerf.frameMs * 0.9 + dt * 0.1
      }
    }
    lastFrameAt = now
    store.renderActiveStroke()
    updateHud()
  })
}

// Event handler'lar — template'teki @pointer* binding'leri yeterli.
// onMounted'da addEventListener EKLEME (yoksa her olay 2 kez ateşlenir).
// Tek aktif pointer kilidi: avuç ikinci parmağı mevcut çizgiyi gasp edemez.
let activePointerId: number | null = null

const startDraw = (e: PointerEvent) => {
  if (!overlayCanvas.value || activePointerId !== null) return
  if (store.rejectTouch && e.pointerType === 'touch') return
  // pointer capture ile canvas dışına taşınca bile çizmeye devam et
  try {
    overlayCanvas.value.setPointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
  const started = store.startDrawing(e)
  if (!started) return
  activePointerId = e.pointerId
  scheduleRender()
}

const draw = (e: PointerEvent) => {
  if (!store.isDrawing || activePointerId === null || e.pointerId !== activePointerId) return
  // Sadece basılıyken çiz (pointermove hover'da ateşlenir)
  if (e.buttons === 0 && e.pointerType === 'mouse') return
  // coalesced events: birikmiş ara noktaları da işle, çizgi köşelenmesin
  const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e]
  for (const ev of events) store.draw(ev as PointerEvent)
  scheduleRender()
}

const endDraw = (e?: PointerEvent) => {
  if (!store.isDrawing) {
    activePointerId = null
    return
  }
  if (e && activePointerId !== null && e.pointerId !== activePointerId) return
  activePointerId = null
  if (rafId !== 0) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
  // stopDrawing stroke'u base'e işler + overlay'i temizler — ek redraw gerekmez.
  store.stopDrawing()
  updateHud(true)
}

const undo = () => {
  store.undoLastStroke()
  updateHud(true)
}

const redo = () => {
  store.redo()
  updateHud(true)
}

// Input'ta yazarken tetiklenmez; çizim sırasında el klavyedeyse çalışır.
const onKeyDown = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return
  const key = e.key.toLowerCase()
  if (key === 'z' && !e.shiftKey) {
    e.preventDefault()
    store.undoLastStroke()
    updateHud(true)
  } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
    e.preventDefault()
    store.redo()
    updateHud(true)
  }
}

const exportPng = () => {
  const url = store.exportDataURL()
  if (!url) return
  const a = document.createElement('a')
  a.href = url
  a.download = `calem-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`
  a.click()
}

const clearCanvas = () => {
  activePointerId = null
  store.clearCanvas()
  updateHud(true)
}

const sizeCanvas = () => {
  if (!baseCanvas.value || !overlayCanvas.value) return
  store.resizeCanvas()
}

// Canvas initialization
onMounted(() => {
  if (!baseCanvas.value || !overlayCanvas.value) return
  overlayCanvas.value.style.touchAction = 'none'

  store.setCanvasRef(baseCanvas.value)
  store.setOverlayRef(overlayCanvas.value)
  // DPR-aware backing store + ilk redraw store üzerinden
  store.setupCanvas()
  // Kayıtlı sahne varsa yükle (repaint içeride), sonra HUD'u tazele
  store.loadPersisted().then(() => updateHud(true))
  updateHud(true)

  window.addEventListener('resize', sizeCanvas)
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  if (rafId !== 0) cancelAnimationFrame(rafId)
  activePointerId = null
  window.removeEventListener('resize', sizeCanvas)
  window.removeEventListener('keydown', onKeyDown)
  store.setCanvasRef(null)
  store.setOverlayRef(null)
})
</script>

<style scoped>
canvas {
  -webkit-tap-highlight-color: transparent;
  touch-action: none;
  user-select: none;
}
</style>
