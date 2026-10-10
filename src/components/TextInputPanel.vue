<template>
  <div v-if="isEditing" class="fixed" :style="panelStyle" @mousedown.stop>
    <!-- Textarea (text input) -->
    <textarea
      ref="textInputRef"
      v-model="currentText"
      class="w-full border-2 border-indigo-500 rounded bg-white/95 p-2 resize-none shadow-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
      :style="{ minHeight: '40px', fontSize: `${fontSize}px` }"
      @blur="handleBlur"
      @keydown.escape="handleCancel"
      @input="emit('input', currentText)"
    />

    <!-- Control Panel (textarea altında) -->
    <div class="mt-2 flex items-center gap-3 px-2 py-2 bg-white/90 border border-indigo-300 rounded shadow-md">
      <!-- Font Size Slider -->
      <div class="flex items-center gap-2 flex-1">
        <label class="text-xs font-medium text-gray-700 whitespace-nowrap">Size:</label>
        <input
          type="range"
          :value="fontSize"
          min="8"
          max="120"
          step="2"
          class="flex-1 h-2 bg-gray-200 rounded appearance-none cursor-pointer"
          @input="(e) => updateFontSize(Number((e.target as HTMLInputElement).value))"
        />
        <span class="text-xs font-mono text-gray-600 w-10 text-right">{{ fontSize }}px</span>
      </div>

      <!-- Color Picker -->
      <div class="flex items-center gap-2">
        <label class="text-xs font-medium text-gray-700">Color:</label>
        <input
          type="color"
          :value="textColor"
          class="w-8 h-8 rounded cursor-pointer border border-gray-300"
          @input="(e) => updateColor((e.target as HTMLInputElement).value)"
        />
      </div>

      <!-- Cancel Button -->
      <button
        @click="handleCancel"
        class="px-3 py-1 text-xs font-medium rounded bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
      >
        Cancel
      </button>

      <!-- Done Button -->
      <button
        @click="handleDone"
        class="px-3 py-1 text-xs font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700 transition"
      >
        Done
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, watch } from 'vue'

interface Props {
  isEditing: boolean
  initialText?: string
  initialFontSize?: number
  initialColor?: string
  canvasElement?: HTMLCanvasElement
  position?: {
    left: number
    top: number
    width: number
  }
}

interface Emits {
  (e: 'done', text: string): void
  (e: 'cancel'): void
  (e: 'update:fontSize', size: number): void
  (e: 'update:color', color: string): void
  (e: 'input', text: string): void
}

const props = withDefaults(defineProps<Props>(), {
  initialText: '',
  initialFontSize: 16,
  initialColor: '#000000',
  position: () => ({ left: 0, top: 0, width: 200 }),
})

const emit = defineEmits<Emits>()

const textInputRef = ref<HTMLTextAreaElement>()
const currentText = ref(props.initialText)
const fontSize = ref(props.initialFontSize)
const textColor = ref(props.initialColor)

// Panel pozisyonu ve stil
const panelStyle = computed(() => {
  if (!props.position) return {}
  return {
    left: `${props.position.left}px`,
    top: `${props.position.top}px`,
    width: `${props.position.width}px`,
    zIndex: 50,
  }
})

// Font size güncelle
const updateFontSize = (size: number) => {
  fontSize.value = size
  emit('update:fontSize', size)
}

// Renk güncelle
const updateColor = (color: string) => {
  textColor.value = color
  emit('update:color', color)
}

// Done işlemi
const handleDone = () => {
  emit('done', currentText.value)
}

// Cancel işlemi
const handleCancel = () => {
  currentText.value = ''
  emit('cancel')
}

// Blur işlemi (alt tıklandığında)
const handleBlur = () => {
  // Optional: Blur'da Done olarak davran
  // emit('done', currentText.value)
}

// Prop değişse güncelle
watch(
  () => props.initialText,
  (newText) => {
    currentText.value = newText || ''
  },
)

watch(
  () => props.initialFontSize,
  (newSize) => {
    fontSize.value = newSize || 16
  },
)

watch(
  () => props.initialColor,
  (newColor) => {
    textColor.value = newColor || '#000000'
  },
)

// Active olunca focus et
watch(
  () => props.isEditing,
  (isActive) => {
    if (isActive) {
      nextTick(() => {
        textInputRef.value?.focus()
      })
    }
  },
)

// Export ref (parent'tan erişim için)
defineExpose({
  textInputRef,
})
</script>

<style scoped>
/* Slider styling */
input[type='range'] {
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  cursor: pointer;
}

input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #4f46e5;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

input[type='range']::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #4f46e5;
  cursor: pointer;
  border: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

input[type='range']::-webkit-slider-runnable-track {
  background: #e5e7eb;
  height: 6px;
  border-radius: 3px;
}

input[type='range']::-moz-range-track {
  background: #e5e7eb;
  height: 6px;
  border-radius: 3px;
  border: none;
}
</style>
