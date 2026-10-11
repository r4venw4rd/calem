<template>
  <div
    v-if="store.currentTool === 'text' && store.activeTextId && !presenting && activeTextScreenRect"
    class="absolute pointer-events-auto flex flex-col"
    :style="containerStyle"
    role="dialog"
    :aria-label="t('textEditor')"
  >
    <textarea
      ref="textAreaRef"
      rows="2"
      :value="store.activeText()?.text ?? ''"
      @input="emit('input', $event)"
      @keydown.escape="emit('close')"
      :placeholder="t('textPlaceholder')"
      class="w-full min-h-[44px] px-2.5 py-1.5 rounded-lg border-2 border-dashed border-indigo-500 bg-[var(--chrome-bg)]/90 text-[var(--chrome-title)] shadow-xl focus:outline-none focus:border-indigo-400 resize-y backdrop-blur-sm"
      :style="{
        color: store.activeText()?.color ?? store.color,
        fontSize: `${activeTextScreenRect.fontPx}px`,
        lineHeight: 1.25,
      }"
    ></textarea>
    <!-- Text altında floating şekilde duran kontrol çubuğu -->
    <div class="mt-1.5 flex items-center gap-2 p-1.5 rounded-lg bg-[var(--chrome-bg)] border border-[var(--chrome-border-strong)] shadow-xl backdrop-blur select-none w-max max-w-[calc(100vw-2rem)]">
      <input
        type="range"
        :min="SLIDERS.textSize.min"
        :max="SLIDERS.textSize.max"
        :step="SLIDERS.textSize.step"
        :value="store.activeText()?.size ?? store.textSize"
        @input="emit('size-input', Number(($event.target as HTMLInputElement).value))"
        class="w-20 accent-indigo-600"
        :title="t('textSizeShort')"
      />
      <span class="text-[11px] font-mono text-[var(--chrome-text)] w-5 text-right">
        {{ store.activeText()?.size ?? store.textSize }}
      </span>
      <input
        type="color"
        :value="store.activeText()?.color ?? store.color"
        @input="emit('color-input', ($event.target as HTMLInputElement).value)"
        class="w-6 h-6 rounded bg-transparent border border-[var(--chrome-border-strong)] cursor-pointer p-0.5"
        :title="t('textColor')"
      />
      <button
        @click="emit('delete')"
        class="px-2 py-0.5 rounded text-xs hover:bg-red-600/30 text-red-400 transition"
        :title="t('delete')"
      >
        {{ t('delete') }}
      </button>
      <button
        @click="emit('close')"
        class="px-2.5 py-0.5 rounded text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition shadow-sm"
        :title="t('doneTitle')"
      >
        {{ t('done') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, type CSSProperties } from 'vue'
import { useDrawingStore } from '@/stores/drawing'
import { useLocale } from '@/composables/useLocale'
import { SLIDERS } from '@/config/ui'

defineProps<{
  presenting: boolean
  activeTextScreenRect: {
    left: number
    top: number
    width: number
    fontPx: number
  } | null
  containerStyle: CSSProperties
}>()

const emit = defineEmits<{
  (e: 'input', event: Event): void
  (e: 'size-input', size: number): void
  (e: 'color-input', color: string): void
  (e: 'delete'): void
  (e: 'close'): void
}>()

const store = useDrawingStore()
const { t } = useLocale()

const textAreaRef = ref<HTMLTextAreaElement | null>(null)
defineExpose({
  focus: () => textAreaRef.value?.focus(),
  textarea: textAreaRef,
})
</script>
