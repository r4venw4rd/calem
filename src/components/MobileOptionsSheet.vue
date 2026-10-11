<template>
  <div
    v-if="open"
    class="fixed inset-0 z-40 flex items-end bg-black/50"
    role="dialog"
    aria-modal="true"
    :aria-label="t('palette')"
    @pointerdown.self="emit('close')"
  >
    <div
      class="w-full max-h-[70vh] overflow-y-auto rounded-t-2xl bg-[var(--chrome-bg)] border-t border-[var(--chrome-border-strong)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-xs text-[var(--chrome-text)] shadow-2xl"
    >
      <div class="flex items-center justify-between mb-2">
        <span class="font-medium text-[var(--chrome-title)]">{{ t('palette') }}</span>
        <button @click="emit('close')" class="px-2 py-1 rounded hover:bg-[var(--chrome-bg-soft)]">{{ t('done') }}</button>
      </div>

      <template v-if="store.currentTool !== 'select' && store.currentTool !== 'hand' && store.currentTool !== 'eraser'">
        <select
          :value="store.activePaletteId"
          @change="store.setActivePalette(($event.target as HTMLSelectElement).value)"
          class="w-full mb-2 px-2 py-1.5 rounded bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border-strong)] text-[var(--chrome-title)]"
        >
          <option v-for="p in store.palettes" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="hex in store.activePalette.colors"
            :key="hex"
            @click="store.setColor(hex)"
            class="w-9 h-9 rounded-full border-2"
            :class="store.color.toLowerCase() === hex ? 'border-[var(--chrome-title)] scale-105' : 'border-[var(--chrome-border-strong)]'"
            :style="{ background: hex }"
          ></button>
        </div>
      </template>

      <div
        v-if="['pen', 'highlighter', 'eraser', 'line', 'rect', 'ellipse', 'arrow'].includes(store.currentTool)"
        class="mt-3"
      >
        <div class="mb-1 text-[var(--chrome-muted)]">{{ t('width') }} <span class="font-mono">{{ store.strokeWidth }}</span></div>
        <input
          type="range"
          :min="store.widthMin"
          :max="store.widthMax"
          :value="store.strokeWidth"
          @input="store.setStrokeWidth(Number(($event.target as HTMLInputElement).value))"
          class="w-full accent-indigo-600"
        />
      </div>

      <div v-if="['pen', 'line', 'rect', 'ellipse', 'arrow'].includes(store.currentTool)" class="mt-3 flex items-center gap-2">
        <select
          :value="store.strokeDash"
          @change="store.setStrokeDash(($event.target as HTMLSelectElement).value)"
          class="px-2 py-1.5 rounded bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border-strong)] text-[var(--chrome-title)]"
        >
          <option value="solid">{{ t('solid') }}</option>
          <option value="dash">{{ t('dashed') }}</option>
          <option value="dot">{{ t('dotted') }}</option>
        </select>
        <input
          type="range"
          :min="SLIDERS.opacity.min"
          :max="SLIDERS.opacity.max"
          :step="SLIDERS.opacity.step"
          :value="store.strokeOpacity"
          @input="store.setStrokeOpacity(Number(($event.target as HTMLInputElement).value))"
          class="flex-1 accent-indigo-600"
        />
        <span class="font-mono w-10 text-right">{{ Math.round(store.strokeOpacity * 100) }}%</span>
      </div>

      <div v-if="store.currentTool === 'eraser'" class="mt-3 flex gap-1">
        <button
          @click="store.setEraserMode('standard')"
          :class="store.eraserMode === 'standard' ? 'bg-indigo-600 text-white' : 'bg-[var(--chrome-bg-soft)]'"
          class="flex-1 px-2 py-1.5 rounded font-medium transition"
        >
          {{ t('eraserStandard') }}
        </button>
        <button
          @click="store.setEraserMode('stroke')"
          :class="store.eraserMode === 'stroke' ? 'bg-indigo-600 text-white' : 'bg-[var(--chrome-bg-soft)]'"
          class="flex-1 px-2 py-1.5 rounded font-medium transition"
        >
          {{ t('eraserStroke') }}
        </button>
      </div>

      <div v-if="store.currentTool === 'text'" class="mt-3">
        <div class="mb-1 text-[var(--chrome-muted)]">{{ t('textSizeShort') }} <span class="font-mono">{{ store.textSize }}</span></div>
        <input
          type="range"
          :min="SLIDERS.textSize.min"
          :max="SLIDERS.textSize.max"
          :step="SLIDERS.textSize.step"
          :value="store.textSize"
          @input="store.setTextSize(Number(($event.target as HTMLInputElement).value))"
          class="w-full accent-indigo-600"
        />
      </div>

      <div v-if="store.currentTool === 'select'" class="flex flex-wrap gap-1">
        <button @click="store.setSelectMode('rect')" :class="store.selectMode === 'rect' ? 'bg-indigo-600 text-white' : 'bg-[var(--chrome-bg-soft)]'" class="px-3 py-1.5 rounded font-medium transition">{{ t('rectSel') }}</button>
        <button @click="store.setSelectMode('lasso')" :class="store.selectMode === 'lasso' ? 'bg-indigo-600 text-white' : 'bg-[var(--chrome-bg-soft)]'" class="px-3 py-1.5 rounded font-medium transition">{{ t('lassoSel') }}</button>
        <button @click="emit('select-all')" class="px-3 py-1.5 rounded bg-[var(--chrome-bg-soft)]">{{ t('selectAll') }}</button>
        <button @click="emit('select-copy')" :disabled="store.selectionCount === 0" class="px-3 py-1.5 rounded bg-[var(--chrome-bg-soft)] disabled:opacity-30">{{ t('copy') }}</button>
        <button @click="emit('select-paste')" :disabled="store.clipboardCount === 0" class="px-3 py-1.5 rounded bg-[var(--chrome-bg-soft)] disabled:opacity-30">{{ t('paste') }}</button>
        <button @click="emit('select-delete')" :disabled="store.selectionCount === 0" class="px-3 py-1.5 rounded bg-[var(--chrome-bg-soft)] disabled:opacity-30">{{ t('delSel') }}</button>
      </div>

      <div class="mt-3 pt-2 border-t border-[var(--chrome-border)] flex gap-1">
        <button @click="emit('clear')" class="flex-1 px-2 py-1.5 rounded bg-[var(--chrome-bg-soft)] text-red-400 transition">{{ t('clear') }}</button>
        <button @click="emit('present')" class="flex-1 px-2 py-1.5 rounded bg-[var(--chrome-bg-soft)] transition">{{ t('present') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDrawingStore } from '@/stores/drawing'
import { useLocale } from '@/composables/useLocale'
import { SLIDERS } from '@/config/ui'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select-all'): void
  (e: 'select-copy'): void
  (e: 'select-paste'): void
  (e: 'select-delete'): void
  (e: 'clear'): void
  (e: 'present'): void
}>()

const store = useDrawingStore()
const { t } = useLocale()
</script>
