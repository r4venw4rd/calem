<template>
  <Teleport to="body">
    <div
      ref="panelEl"
      v-if="open"
      class="fixed left-1/2 top-[68px] z-30 w-72 max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-90px)] overflow-y-auto -translate-x-1/2 rounded-2xl border border-[var(--chrome-border-strong)] bg-[var(--float-bg)] p-3 text-xs text-[var(--chrome-text)] shadow-xl backdrop-blur"
      role="dialog"
      :aria-label="t('palette')"
    >
      <div class="flex items-center justify-between mb-2">
        <span class="font-medium text-[var(--chrome-title)]">{{ locTools[store.currentTool].label }}</span>
        <button @click="$emit('close')" class="px-2 py-1 rounded hover:bg-[var(--chrome-bg-soft)]">{{ t('done') }}</button>
      </div>
      <!-- Seçim İşlemleri (Select aktifken) -->
      <div
        v-if="store.currentTool === 'select'"
        class="flex flex-wrap items-center gap-1"
        role="toolbar"
        :aria-label="t('selOps')"
      >
        <button
          @click="store.setSelectMode('rect')"
          :class="store.selectMode === 'rect' ? 'bg-indigo-600 text-white' : 'text-[var(--chrome-text)] hover:text-[var(--chrome-title)]'"
          class="px-2 py-1 rounded text-xs font-medium transition"
          :title="t('rectSelTitle')"
        >
          {{ t('rectSel') }}
        </button>
        <button
          @click="store.setSelectMode('lasso')"
          :class="store.selectMode === 'lasso' ? 'bg-indigo-600 text-white' : 'text-[var(--chrome-text)] hover:text-[var(--chrome-title)]'"
          class="px-2 py-1 rounded text-xs font-medium transition"
          :title="t('lassoSelTitle')"
        >
          {{ t('lassoSel') }}
        </button>
        <span class="w-px h-4 bg-[var(--chrome-border)]"></span>
        <button
          @click="selAll"
          class="px-2 py-1 rounded text-xs text-[var(--chrome-text)] hover:text-[var(--chrome-title)] transition"
          :title="t('selectAllTitle')"
        >
          {{ t('selectAll') }}
        </button>
        <button
          @click="selCopy"
          :disabled="store.selectionCount === 0"
          class="px-2 py-1 rounded text-xs text-[var(--chrome-text)] hover:text-[var(--chrome-title)] transition disabled:opacity-40 disabled:cursor-not-allowed"
          :title="t('copyTitle')"
        >
          {{ t('copy') }}
        </button>
        <button
          @click="selPaste"
          :disabled="store.clipboardCount === 0"
          class="px-2 py-1 rounded text-xs text-[var(--chrome-text)] hover:text-[var(--chrome-title)] transition disabled:opacity-40 disabled:cursor-not-allowed"
          :title="t('pasteTitle')"
        >
          {{ t('paste') }}
        </button>
        <button
          @click="selDelete"
          :disabled="store.selectionCount === 0"
          class="px-2 py-1 rounded text-xs text-[var(--chrome-text)] hover:text-red-400 transition disabled:opacity-40 disabled:cursor-not-allowed"
          :title="t('delSelTitle')"
        >
          {{ t('delSel') }}<span v-if="store.selectionCount > 0" class="font-mono"> ({{ store.selectionCount }})</span>
        </button>
      </div>

      <!-- Renk Paleti (Tek Satır: Hazır Palet + Renkler + Damlalık + Custom Renkler) -->
      <div
        v-if="store.currentTool !== 'select' && store.currentTool !== 'hand' && store.currentTool !== 'eraser'"
        class="flex flex-wrap items-center gap-2"
        role="toolbar"
        :aria-label="t('palette')"
      >
        <span class="w-px h-5 bg-[var(--chrome-border)] mx-0.5"></span>
        <select
          :value="store.activePaletteId"
          @change="store.setActivePalette(($event.target as HTMLSelectElement).value)"
          class="max-w-22 px-1.5 py-1 rounded bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border-strong)] text-xs text-[var(--chrome-title)] focus:outline-none"
          :title="t('paletteTitle')"
        >
          <option v-for="p in store.palettes" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <div class="flex items-center gap-1 shrink-0">
          <span
            v-for="hex in store.activePalette.colors"
            :key="hex"
            class="relative group shrink-0"
          >
            <button
              @click="store.setColor(hex)"
              :title="hex"
              class="w-5 h-5 rounded-full border transition block"
              :class="store.color.toLowerCase() === hex ? 'border-[var(--chrome-title)] scale-110 ring-2 ring-indigo-500/60' : 'border-[var(--chrome-border-strong)] hover:border-[var(--chrome-title)]'"
              :style="{ background: hex }"
            ></button>
            <button
              @click="store.removeColorFromPalette(hex)"
              :title="t('removeFromPalette')"
              class="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 hidden group-hover:flex group-focus-within:flex pointer-coarse:flex items-center justify-center rounded-full bg-[var(--chrome-bg-solid)] border border-[var(--chrome-border-strong)] text-[9px] leading-none text-[var(--chrome-text)]"
            >
              ×
            </button>
          </span>
        </div>

        <span class="w-px h-4 bg-[var(--chrome-border)] mx-0.5"></span>

        <!-- Custom Renkler & Damlalık -->
        <div class="flex items-center gap-1 shrink-0">
          <input
            ref="customPicker"
            type="color"
            :value="store.color"
            @input="onCustomInput(($event.target as HTMLInputElement).value)"
            @cancel="pickerArmed = false"
            class="w-5 h-5 rounded-full appearance-none bg-transparent border border-dashed border-[var(--chrome-border-strong)] cursor-pointer p-0 shrink-0"
            :title="t('customColor')"
          />
          <span
            v-for="i in CUSTOM_SLOT_COUNT"
            :key="'c' + i"
            class="relative group shrink-0"
          >
            <button
              v-if="store.customColors[i - 1]"
              @click="store.setColor(store.customColors[i - 1]!); editingCustom = null"
              :title="`${store.customColors[i - 1]} ${t('editCustomSuffix')}`"
              class="w-5 h-5 rounded-full border transition block"
              :class="[
                store.color.toLowerCase() === store.customColors[i - 1] ? 'border-[var(--chrome-title)] scale-110 ring-2 ring-indigo-500/60' : 'border-[var(--chrome-border-strong)] hover:border-[var(--chrome-title)]',
                editingCustom === i - 1 ? 'ring-2 ring-indigo-500' : '',
              ]"
              :style="{ background: store.customColors[i - 1] }"
            ></button>
            <button
              v-else-if="i === firstEmptySlot"
              @click="pickCustom()"
              :title="t('openPicker')"
              class="w-5 h-5 rounded-full border border-dashed border-[var(--chrome-border-strong)] text-xs text-[var(--chrome-text)] hover:text-[var(--chrome-title)] transition font-mono flex items-center justify-center leading-none"
            >
              +
            </button>
            <button
              v-if="store.customColors[i - 1]"
              @click="store.removeCustomColor(store.customColors[i - 1]!)"
              :title="t('removeCustom')"
              class="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 hidden group-hover:flex group-focus-within:flex pointer-coarse:flex items-center justify-center rounded-full bg-[var(--chrome-bg-solid)] border border-[var(--chrome-border-strong)] text-[9px] leading-none text-[var(--chrome-text)]"
            >
              ×
            </button>
            <button
              v-if="store.customColors[i - 1]"
              @click="editingCustom = i - 1"
              :title="t('editCustom')"
              class="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 hidden group-hover:flex group-focus-within:flex pointer-coarse:flex items-center justify-center rounded-full bg-[var(--chrome-bg-solid)] border border-[var(--chrome-border-strong)] text-[9px] leading-none text-[var(--chrome-text)]"
            >
              ✎
            </button>
          </span>
        </div>
      </div>

      <!-- Kalınlık, Çizgi Stili, Opaklık ve Silgi Modu -->
      <div
        v-if="store.currentTool !== 'select' && store.currentTool !== 'text' && store.currentTool !== 'image' && store.currentTool !== 'hand'"
        class="flex flex-wrap items-center gap-x-1.5 gap-y-2"
      >
        <span class="w-px h-4 bg-[var(--chrome-border)] mx-0.5"></span>
        <span class="text-xs text-[var(--chrome-muted)] whitespace-nowrap">{{ t('width') }}</span>
        <input
          type="range"
          :min="store.widthMin"
          :max="store.widthMax"
          :value="store.strokeWidth"
          @input="store.setStrokeWidth(Number(($event.target as HTMLInputElement).value))"
          class="w-18 accent-indigo-600 cursor-pointer"
        />
        <span class="text-xs text-[var(--chrome-text)] w-5 text-right font-mono">{{ store.strokeWidth }}</span>

        <template v-if="['pen', 'line', 'rect', 'ellipse', 'arrow'].includes(store.currentTool)">
          <span class="w-px h-4 bg-[var(--chrome-border)] mx-0.5"></span>
          <select
            :value="store.strokeDash"
            @change="store.setStrokeDash(($event.target as HTMLSelectElement).value)"
            class="px-1.5 py-1 rounded bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border-strong)] text-xs text-[var(--chrome-title)] focus:outline-none"
            :title="t('lineStyle')"
          >
            <option value="solid">{{ t('solid') }}</option>
            <option value="dash">{{ t('dashed') }}</option>
            <option value="dot">{{ t('dotted') }}</option>
          </select>
          <span class="text-xs text-[var(--chrome-muted)] whitespace-nowrap">{{ t('opacity') }}</span>
          <input
            type="range"
            :min="SLIDERS.opacity.min"
            :max="SLIDERS.opacity.max"
            :step="SLIDERS.opacity.step"
            :value="store.strokeOpacity"
            @input="store.setStrokeOpacity(Number(($event.target as HTMLInputElement).value))"
            class="w-14 accent-indigo-600 cursor-pointer"
            :title="t('opacity')"
          />
          <span class="text-xs text-[var(--chrome-text)] w-7 text-right font-mono">{{ Math.round(store.strokeOpacity * 100) }}%</span>
        </template>

        <template v-if="store.currentTool === 'eraser'">
          <span class="w-px h-4 bg-[var(--chrome-border)] mx-0.5"></span>
          <button
            @click="store.setEraserMode('standard')"
            :class="store.eraserMode === 'standard' ? 'bg-indigo-600 text-white' : 'text-[var(--chrome-text)] hover:text-[var(--chrome-title)]'"
            class="px-2 py-1 rounded text-xs font-medium transition"
            :title="t('eraserStandardTitle')"
          >
            {{ t('eraserStandard') }}
          </button>
          <button
            @click="store.setEraserMode('stroke')"
            :class="store.eraserMode === 'stroke' ? 'bg-indigo-600 text-white' : 'text-[var(--chrome-text)] hover:text-[var(--chrome-title)]'"
            class="px-2 py-1 rounded text-xs font-medium transition"
            :title="t('eraserStrokeTitle')"
          >
            {{ t('eraserStroke') }}
          </button>
        </template>
      </div>

      <!-- Metin Boyutu -->
      <div v-if="store.currentTool === 'text'" class="flex flex-wrap items-center gap-1.5">
        <span class="w-px h-4 bg-[var(--chrome-border)] mx-0.5"></span>
        <span class="text-xs text-[var(--chrome-muted)] whitespace-nowrap">{{ t('textLabel') }}</span>
        <input
          type="range"
          :min="SLIDERS.textSize.min"
          :max="SLIDERS.textSize.max"
          :step="SLIDERS.textSize.step"
          :value="store.textSize"
          @input="store.setTextSize(Number(($event.target as HTMLInputElement).value))"
          class="w-20 accent-indigo-600 cursor-pointer"
          :title="t('textSizeTitle')"
        />
        <span class="text-xs text-[var(--chrome-text)] w-5 text-right font-mono">{{ store.textSize }}</span>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDrawingStore } from '@/stores/drawing'
import { useLocale } from '@/composables/useLocale'
import { useSelectionOps } from '@/composables/useSelectionOps'
import { CUSTOM_SLOT_COUNT } from '@/config/palettes'
import { SLIDERS } from '@/config/ui'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'changed'): void }>()

const store = useDrawingStore()
const { t, locTools } = useLocale()

// Dışarı-tıkla kapatma için (üst bileşen okur).
const panelEl = ref<HTMLElement | null>(null)
defineExpose({ panelEl })

const { selAll, selCopy, selPaste, selDelete } = useSelectionOps(() => emit('changed'))

// Custom renk satırında yalnızca İLK boş slot "+" gösterir; kalanı çizilmez.
const firstEmptySlot = computed<number | null>(() =>
  store.customColors.length < CUSTOM_SLOT_COUNT ? store.customColors.length + 1 : null,
)

// Damla: normalde rengi seçer. ✎ ile silahlanmış slot varsa onu düzenler (tek atımlık).
const customPicker = ref<HTMLInputElement | null>(null)
const editingCustom = ref<number | null>(null)
let pickerArmed = false
const onCustomInput = (hex: string) => {
  if (pickerArmed) {
    pickerArmed = false
    store.addCustomColor(hex)
    return
  }
  if (editingCustom.value !== null) {
    const i = editingCustom.value
    editingCustom.value = null
    store.setCustomSlot(i, hex)
    return
  }
  store.setColor(hex)
}
const pickCustom = () => {
  const picker = customPicker.value
  pickerArmed = false
  if (picker && typeof picker.showPicker === 'function') {
    try {
      pickerArmed = true
      picker.showPicker()
      return
    } catch {
      pickerArmed = false
    }
  }
  store.addCustomColor()
}
</script>
