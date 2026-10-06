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

      <span class="w-px h-4 bg-white/10"></span>

      <label
        class="px-3 py-1 rounded text-xs font-medium text-gray-300 hover:text-white transition cursor-pointer"
        :class="{ 'opacity-40 pointer-events-none': store.pdfBusy }"
        title="PDF aç — sayfalar PDF sayfalarıyla değişir"
      >
        PDF Aç
        <input
          type="file"
          accept="application/pdf,.pdf"
          class="hidden"
          :disabled="store.pdfBusy"
          @change="onPdfFile"
        />
      </label>

      <button
        @click="exportPdfDoc"
        :disabled="store.pdfBusy"
        class="px-3 py-1 rounded text-xs font-medium text-gray-300 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
        title="Konum + isim seçerek PDF olarak indir"
      >
        PDF Yaz
      </button>

      <span v-if="store.pdfName" class="flex items-center gap-1 text-[10px] text-gray-400 font-mono max-w-40 truncate" :title="store.pdfName">
        {{ store.pdfName }}
        <button @click="askClosePdf" class="text-gray-500 hover:text-white" title="PDF'i kapat">
          Kapat
        </button>
      </span>

      <span v-if="store.pdfBusy" class="text-[10px] text-yellow-400/80 font-mono">işleniyor…</span>
      <span v-if="pdfError" class="text-[10px] text-red-400 font-mono">{{ pdfError }}</span>

      <button
        @click="showSettings = !showSettings"
        class="px-3 py-1 rounded text-xs font-medium text-gray-300 hover:text-white transition"
        :class="{ 'bg-white/10 text-white': showSettings }"
        title="Ayarlar"
      >
        Ayarlar
      </button>

      <div
        v-if="showSettings"
        class="absolute right-2 top-full mt-1 z-20 w-64 rounded-lg bg-gray-900 border border-white/15 p-3 text-xs text-gray-300 shadow-xl"
        role="dialog"
        aria-label="Ayarlar"
      >
        <div class="flex items-center justify-between mb-2">
          <span class="font-medium text-gray-100">Ayarlar</span>
          <button @click="showSettings = false" class="text-gray-500 hover:text-white" title="Kapat">
            Kapat
          </button>
        </div>

        <div class="mb-1 text-gray-400">Kâğıt teması</div>
        <div class="flex gap-2 mb-3">
          <button
            v-for="(hex, name) in PAPER_THEMES"
            :key="name"
            @click="store.setPaper(hex)"
            :title="String(name)"
            class="w-8 h-8 rounded-full border-2 transition"
            :class="store.paper === hex ? 'border-white' : 'border-white/20 hover:border-white/50'"
            :style="{ background: hex }"
          ></button>
        </div>

        <div class="mb-1 text-gray-400">Sayfa biçimi <span class="text-gray-600">(yeni sayfalar)</span></div>
        <select
          :value="store.pageFormat"
          @change="store.setPageFormat(($event.target as HTMLSelectElement).value)"
          class="w-full px-2 py-1 rounded bg-white/10 border border-white/15 text-gray-100"
        >
          <option v-for="(_, name) in PAGE_FORMATS" :key="name" :value="name">{{ name }}</option>
          <option value="custom">Özel</option>
        </select>

        <div class="flex gap-1 mt-2">
          <button
            @click="store.setPageOrientation('portrait')"
            class="flex-1 px-2 py-1 rounded transition"
            :class="store.pageOrientation === 'portrait' ? 'bg-indigo-600 text-white' : 'bg-white/5 hover:bg-white/10'"
          >
            Dikey
          </button>
          <button
            @click="store.setPageOrientation('landscape')"
            class="flex-1 px-2 py-1 rounded transition"
            :class="store.pageOrientation === 'landscape' ? 'bg-indigo-600 text-white' : 'bg-white/5 hover:bg-white/10'"
          >
            Yatay
          </button>
        </div>

        <div v-if="store.pageFormat === 'custom'" class="flex items-center gap-2 mt-2">
          <label class="flex-1">
            <span class="text-gray-500">Genişlik</span>
            <input
              type="number"
              min="100"
              max="3000"
              :value="store.customW"
              @change="store.setCustomSize(Number(($event.target as HTMLInputElement).value), store.customH)"
              class="w-full px-2 py-1 rounded bg-white/10 border border-white/15 text-gray-100"
            />
          </label>
          <label class="flex-1">
            <span class="text-gray-500">Yükseklik</span>
            <input
              type="number"
              min="100"
              max="3000"
              :value="store.customH"
              @change="store.setCustomSize(store.customW, Number(($event.target as HTMLInputElement).value))"
              class="w-full px-2 py-1 rounded bg-white/10 border border-white/15 text-gray-100"
            />
          </label>
        </div>
      </div>

      <button
        @click="clearCanvas"
        class="px-3 py-1 rounded text-xs font-medium text-gray-300 hover:text-white transition flex items-center gap-1"
        title="Aktif sayfayı temizle"
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

      <div
        class="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/60 border border-white/10 text-xs text-gray-300 select-none"
        role="navigation"
        aria-label="Sayfalar"
      >
        <button
          @click="prevPage"
          :disabled="store.activePageIndex === 0"
          class="px-2 py-0.5 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed font-mono"
          title="Önceki sayfa"
        >
          ‹
        </button>
        <span class="font-mono w-12 text-center text-gray-200">
          {{ store.activePageIndex + 1 }} / {{ store.pages.length }}
        </span>
        <button
          @click="nextPage"
          :disabled="store.activePageIndex >= store.pages.length - 1"
          class="px-2 py-0.5 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed font-mono"
          title="Sonraki sayfa"
        >
          ›
        </button>
        <span class="w-px h-4 bg-white/10"></span>
        <button
          @click="addPage"
          class="px-2 py-0.5 rounded hover:bg-white/10 font-mono"
          title="Yeni sayfa"
        >
          +
        </button>
        <button
          @click="askDeletePage"
          :disabled="store.pages.length <= 1"
          class="px-2 py-0.5 rounded hover:bg-red-600/40 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Aktif sayfayı sil"
        >
          Sil
        </button>
        <span class="w-px h-4 bg-white/10"></span>
        <button
          @click="zoomOut"
          class="px-2 py-0.5 rounded hover:bg-white/10 font-mono"
          title="Uzaklaş"
        >
          −
        </button>
        <button
          @click="resetZoom"
          class="font-mono w-12 text-center text-gray-200 hover:bg-white/10 rounded py-0.5"
          :title="`Yakınlaştırma: ${store.zoomLabel} (sıfırlamak için tıkla)`"
        >
          {{ store.zoomLabel }}
        </button>
        <button
          @click="zoomIn"
          class="px-2 py-0.5 rounded hover:bg-white/10 font-mono"
          title="Yakınlaş"
        >
          +
        </button>
      </div>
      <!-- Perf HUD: reaktivite dışı güncellenir (kendisi render tetiklemez) -->
      <div
        ref="hud"
        class="absolute bottom-2 right-2 text-[10px] leading-tight text-gray-500 bg-black/40 rounded px-1.5 py-0.5 pointer-events-none font-mono"
      ></div>

      <div
        v-if="store.savedSession"
        class="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/70 border border-white/15 text-xs text-gray-200 select-none"
        role="dialog"
        aria-label="Önceki oturum"
      >
        <span>
          Önceki oturum ({{ store.savedSession.when }}, {{ store.savedSession.pages }} sayfa,
          {{ store.savedSession.strokes }} çizgi)
        </span>
        <button
          @click="restoreSession"
          class="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
        >
          Geri yükle
        </button>
        <button
          @click="store.dismissSavedSession()"
          class="px-2 py-0.5 rounded hover:bg-white/10 text-gray-300"
        >
          Yeni başlat
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { drawingPerf, PAGE_FORMATS, PAPER_THEMES, useDrawingStore } from '@/stores/drawing'

const baseCanvas = ref<HTMLCanvasElement | null>(null)
const overlayCanvas = ref<HTMLCanvasElement | null>(null)
const hud = ref<HTMLDivElement | null>(null)
const pdfError = ref('')
const showSettings = ref(false)
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
// İKİ parmak = pinch gesture: yarım çizgi çöpe atılır, zoom/pan başlar.
let activePointerId: number | null = null
const pointers = new Map<number, { x: number; y: number }>()
let gesture: { d0: number; mx0: number; my0: number } | null = null
let gestureConsumed = false

const ptrPos = (e: PointerEvent) => {
  const r = overlayCanvas.value!.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

const startDraw = (e: PointerEvent) => {
  if (!overlayCanvas.value) return
  pointers.set(e.pointerId, ptrPos(e))
  if (pointers.size === 2) {
    store.cancelActiveStroke()
    if (rafId !== 0) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    activePointerId = null
    const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }]
    gesture = { d0: Math.hypot(a.x - b.x, a.y - b.y), mx0: (a.x + b.x) / 2, my0: (a.y + b.y) / 2 }
    gestureConsumed = true
    return
  }
  if (pointers.size !== 1 || gesture || gestureConsumed) return
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
  const tracked = pointers.get(e.pointerId)
  if (tracked && overlayCanvas.value) {
    const r = overlayCanvas.value.getBoundingClientRect()
    tracked.x = e.clientX - r.left
    tracked.y = e.clientY - r.top
  }
  if (gesture && pointers.size >= 2) {
    const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }]
    const d1 = Math.hypot(a.x - b.x, a.y - b.y)
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    if (gesture.d0 > 0) store.pinch(d1 / gesture.d0, mx, my, mx - gesture.mx0, my - gesture.my0)
    gesture = { d0: d1, mx0: mx, my0: my }
    updateHud()
    return
  }
  if (!store.isDrawing || activePointerId === null || e.pointerId !== activePointerId) return
  // Sadece basılıyken çiz (pointermove hover'da ateşlenir)
  if (e.buttons === 0 && e.pointerType === 'mouse') return
  // coalesced events: birikmiş ara noktaları da işle, çizgi köşelenmesin
  const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e]
  for (const ev of events) store.draw(ev as PointerEvent)
  scheduleRender()
}

const endDraw = (e?: PointerEvent) => {
  if (e) pointers.delete(e.pointerId)
  if (pointers.size === 0) {
    gesture = null
    gestureConsumed = false
  }
  // Gesture bitene (tüm parmaklar kalkana) kadar çizim kapalı — arta kalan parmak çizmesin.
  if (gesture || gestureConsumed) {
    if (gesture && pointers.size < 2) gesture = null
    return
  }
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

const showPdfError = (msg: string) => {
  pdfError.value = msg
  window.setTimeout(() => {
    if (pdfError.value === msg) pdfError.value = ''
  }, 4000)
}

const onPdfFile = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  const hasInk = store.pages.some((p) => p.strokes.length > 0)
  if (hasInk && !confirm('Mevcut çizimler PDF sayfalarıyla değişecek. Devam?')) return
  const res = await store.importPdf(f)
  if ('error' in res) showPdfError(res.error)
  updateHud(true)
}

const exportPdfDoc = async () => {
  const res = await store.exportPdf()
  // cancelled = kullanıcı picker'da vazgeçti → hata değil, sessizlik
  if ('error' in res) showPdfError(res.error)
}

const askClosePdf = () => {
  const hasInk = store.pages.some((p) => p.strokes.length > 0)
  if (hasInk && !confirm('PDF kapatılıp tek boş sayfaya dönülsün mü?')) return
  store.closePdf()
  updateHud(true)
}

const clearCanvas = () => {
  activePointerId = null
  store.clearCanvas()
  updateHud(true)
}

// Trackpad/mause tekeri: yalın = pan, ctrl/cmd = imleç sabitli zoom.
// passive:false ŞART (sayfa-zoom'u engellemek için preventDefault).
const onWheel = (e: WheelEvent) => {
  e.preventDefault()
  if (!overlayCanvas.value) return
  const r = overlayCanvas.value.getBoundingClientRect()
  const cx = e.clientX - r.left
  const cy = e.clientY - r.top
  if (e.ctrlKey || e.metaKey) {
    const unit = e.deltaMode === 1 ? 16 : 1
    store.zoomBy(Math.exp(-e.deltaY * unit * 0.002), cx, cy)
  } else {
    store.panBy(-e.deltaX, -e.deltaY)
  }
  updateHud(true)
}

const zoomIn = () => {
  store.zoomStep(1.25)
  updateHud(true)
}

const zoomOut = () => {
  store.zoomStep(1 / 1.25)
  updateHud(true)
}

const resetZoom = () => {
  store.resetView()
  updateHud(true)
}

const prevPage = () => {
  store.goToPage(store.activePageIndex - 1)
  updateHud(true)
}

const nextPage = () => {
  store.goToPage(store.activePageIndex + 1)
  updateHud(true)
}

const addPage = () => {
  store.addPage()
  updateHud(true)
}

const askDeletePage = () => {
  if (store.pages.length <= 1) return
  if (confirm(`Sayfa ${store.activePageIndex + 1} silinsin mi? (${store.drawingCount} çizgi kaybolur)`)) {
    activePointerId = null
    store.deletePage(store.activePageIndex)
    updateHud(true)
  }
}

const restoreSession = async () => {
  const ok = await store.loadPersisted()
  if (!ok) showPdfError('Oturum yüklenemedi')
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
  // Önce ayarlar (kâğıt rengi), sonra ilk boya — yanlış renk flaşı yok.
  // Otomatik oturum yükleme YOK: kayıt varsa banner çıkar, seçim kullanıcıda.
  store
    .loadSettings()
    .then(() => {
      store.setupCanvas()
      return store.checkSavedSession()
    })
    .then(() => updateHud(true))
  updateHud(true)

  window.addEventListener('resize', sizeCanvas)
  window.addEventListener('keydown', onKeyDown)
  overlayCanvas.value.addEventListener('wheel', onWheel, { passive: false })
})

onUnmounted(() => {
  if (rafId !== 0) cancelAnimationFrame(rafId)
  activePointerId = null
  pointers.clear()
  gesture = null
  window.removeEventListener('resize', sizeCanvas)
  window.removeEventListener('keydown', onKeyDown)
  overlayCanvas.value?.removeEventListener('wheel', onWheel)
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
