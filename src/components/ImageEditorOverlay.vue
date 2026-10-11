<template>
  <div
    v-if="store.currentTool === 'image' && store.activeImageId && !presenting && activeImageScreenRect"
    class="absolute rounded-lg bg-[var(--chrome-bg)] border border-[var(--chrome-border-strong)] p-2 text-xs text-[var(--chrome-text)] shadow-xl select-none flex items-center gap-2.5 backdrop-blur"
    :style="containerStyle"
    role="dialog"
    :aria-label="t('imageEditor')"
  >
    <div class="flex items-center gap-1.5">
      <span class="text-[var(--chrome-faint)] whitespace-nowrap">{{ t('imgSize') }}</span>
      <input
        type="range"
        :min="SLIDERS.imageWidth.min"
        :max="SLIDERS.imageWidth.max"
        :step="SLIDERS.imageWidth.step"
        :value="store.activeImage()?.w ?? 200"
        @input="emit('resize', Number(($event.target as HTMLInputElement).value))"
        class="w-24 accent-indigo-600"
        :title="t('imgSizeTitle')"
      />
    </div>
    <button
      @click="emit('delete')"
      class="px-2 py-0.5 rounded hover:bg-red-600/30 text-red-400 transition"
      :title="t('delImage')"
    >
      {{ t('delete') }}
    </button>
    <button
      @click="emit('close')"
      class="px-2.5 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
      :title="t('doneTitle')"
    >
      {{ t('done') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { useDrawingStore } from '@/stores/drawing'
import { useLocale } from '@/composables/useLocale'
import { SLIDERS } from '@/config/ui'

defineProps<{
  presenting: boolean
  activeImageScreenRect: {
    left: number
    top: number
    bottom: number
    width: number
    height: number
  } | null
  containerStyle: CSSProperties
}>()

const emit = defineEmits<{
  (e: 'resize', width: number): void
  (e: 'delete'): void
  (e: 'close'): void
}>()

const store = useDrawingStore()
const { t } = useLocale()
</script>
