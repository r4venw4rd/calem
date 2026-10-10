<template>
  <Teleport to="body">
    <div
      ref="panelEl"
      v-if="open"
      class="fixed left-1/2 top-[68px] z-30 w-64 max-w-[calc(100vw-1rem)] -translate-x-1/2 rounded-xl bg-[var(--float-bg)] border border-[var(--chrome-border-strong)] p-3 text-xs text-[var(--chrome-text)] shadow-xl backdrop-blur"
      role="dialog"
      :aria-label="t('layersDialog')"
    >
      <div class="flex items-center justify-between mb-2">
        <span class="font-medium text-[var(--chrome-title)]">{{ t('layersDialog') }} <span class="text-[var(--chrome-faint)]">{{ t('layersOnTop') }}</span></span>
        <button @click="$emit('close')" class="text-[var(--chrome-faint)] hover:text-[var(--chrome-title)]" :title="t('close')">
          {{ t('close') }}
        </button>
      </div>

      <div
        v-for="(l, ri) in layersTopFirst"
        :key="l.id"
        class="flex items-center gap-1 px-1 py-0.5 rounded"
        :class="l.id === store.activePage.activeLayerId ? 'bg-indigo-600/20' : 'hover:bg-[var(--chrome-bg-soft)]'"
      >
        <input
          type="checkbox"
          :checked="l.visible"
          @change="store.toggleLayerVisible(l.id)"
          class="accent-indigo-600"
          :title="t('visibility')"
        />
        <button
          @click="activateLayer(l.id)"
          class="flex-1 min-w-0 text-left truncate px-1 py-0.5 rounded"
          :class="l.id === store.activePage.activeLayerId ? 'text-[var(--chrome-title)] font-medium' : 'text-[var(--chrome-text)]'"
          :title="`${t('makeActive')}: ${l.name}`"
        >
          {{ l.name }}
          <span class="font-mono text-[10px] text-[var(--chrome-faint)]">{{ l.strokes.length }}</span>
        </button>
        <button
          @click="store.moveLayer(l.id, 1)"
          :disabled="ri === 0"
          class="px-1 rounded hover:bg-[var(--chrome-bg-soft)] disabled:opacity-30 disabled:cursor-not-allowed font-mono"
          :title="t('moveUp')"
        >
          ↑
        </button>
        <button
          @click="store.moveLayer(l.id, -1)"
          :disabled="ri === layersTopFirst.length - 1"
          class="px-1 rounded hover:bg-[var(--chrome-bg-soft)] disabled:opacity-30 disabled:cursor-not-allowed font-mono"
          :title="t('moveDown')"
        >
          ↓
        </button>
        <button
          @click="renameLayer(l.id)"
          class="px-1 rounded hover:bg-[var(--chrome-bg-soft)]"
          :title="t('nameLayer')"
        >
          {{ t('rename') }}
        </button>
        <button
          @click="askDeleteLayer(l.id)"
          class="px-1 rounded hover:bg-red-600/40"
          :title="t('deleteLayer')"
        >
          {{ t('delete') }}
        </button>
      </div>

      <button
        @click="addLayerBtn"
        class="mt-2 w-full px-2 py-1 rounded bg-[var(--chrome-bg-soft)] hover:bg-[var(--chrome-bg-soft)] transition font-mono"
        :title="t('newLayerTitle')"
      >
        {{ t('newLayer') }}
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDrawingStore } from '@/stores/drawing'
import { useDialogs } from '@/composables/useDialogs'
import { useLocale } from '@/composables/useLocale'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'changed'): void }>()

const store = useDrawingStore()
const { t, tf } = useLocale()
const { askConfirm, askPrompt } = useDialogs()

// Dışarı-tıkla kapatma için (üst bileşen okur).
const panelEl = ref<HTMLElement | null>(null)
defineExpose({ panelEl })

// Katman listesi üstte-ilk (dizi 0 = en alt).
const layersTopFirst = computed(() => [...store.activePage.layers].reverse())

const activateLayer = (id: string) => {
  store.setActiveLayer(id)
  emit('changed')
}

const addLayerBtn = () => {
  store.addLayer()
  emit('changed')
}

const askDeleteLayer = async (id: string) => {
  const l = store.activePage.layers.find((x) => x.id === id)
  if (!l) return
  if (store.activePage.layers.length > 1 && l.strokes.length > 0) {
    if (!(await askConfirm(`"${l.name}" — ${t('confirmDelete')}`, tf('strokesLost', l.strokes.length))))
      return
  }
  store.deleteLayer(id)
  emit('changed')
}

const renameLayer = async (id: string) => {
  const l = store.activePage.layers.find((x) => x.id === id)
  if (!l) return
  const name = await askPrompt('Katman adı', l.name)
  if (name === null) return
  store.renameLayer(id, name)
}
</script>
