<template>
  <div
    class="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--chrome-bg)] border border-[var(--chrome-border)] text-xs text-[var(--chrome-text)] select-none"
    role="navigation"
    aria-label="Sayfalar"
  >
    <button
      v-if="store.pages.length > 1"
      @click="store.setPageStripOpen(!store.pageStripOpen)"
      class="px-2 py-0.5 rounded hover:bg-[var(--chrome-bg-soft)] transition"
      :class="{ 'bg-[var(--chrome-bg-soft)] text-[var(--chrome-title)]': store.pageStripOpen }"
      :title="t('pageStrip')"
    >
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <rect x="7" y="7" width="14" height="14" rx="2" />
        <path stroke-linecap="round" d="M3 17V5a2 2 0 012-2h12" />
      </svg>
    </button>
    <span v-if="store.pages.length > 1" class="w-px h-4 bg-[var(--chrome-border)]"></span>
    <button
      @click="emit('prev-page')"
      :disabled="store.activePageIndex === 0"
      class="px-2 py-0.5 rounded hover:bg-[var(--chrome-bg-soft)] disabled:opacity-30 disabled:cursor-not-allowed font-mono"
      :title="t('prevPage')"
    >
      ‹
    </button>
    <span class="font-mono w-12 text-center text-[var(--chrome-title)]">
      {{ store.activePageIndex + 1 }} / {{ store.pages.length }}
    </span>
    <button
      @click="emit('next-page')"
      :disabled="store.activePageIndex >= store.pages.length - 1"
      class="px-2 py-0.5 rounded hover:bg-[var(--chrome-bg-soft)] disabled:opacity-30 disabled:cursor-not-allowed font-mono"
      :title="t('nextPage')"
    >
      ›
    </button>
    <span class="w-px h-4 bg-[var(--chrome-border)]"></span>
    <button
      @click="emit('add-page')"
      class="px-2 py-0.5 rounded hover:bg-[var(--chrome-bg-soft)] font-mono"
      :title="t('newPage')"
    >
      +
    </button>
    <button
      @click="emit('delete-page')"
      :disabled="store.pages.length <= 1"
      class="px-2 py-0.5 rounded hover:bg-red-600/40 disabled:opacity-30 disabled:cursor-not-allowed"
      :title="t('delPage')"
    >
      {{ t('delete') }}
    </button>
    <button
      @click="emit('toggle-scroll')"
      class="px-2 py-0.5 rounded hover:bg-[var(--chrome-bg-soft)] font-mono"
      :class="{ 'bg-[var(--chrome-bg-soft)] text-[var(--chrome-title)]': scrollMode }"
      :title="t('scrollViewTitle')"
    >
      {{ t('scrollView') }}
    </button>
    <span class="w-px h-4 bg-[var(--chrome-border)]"></span>
    <button
      @click="emit('zoom-out')"
      class="px-2 py-0.5 rounded hover:bg-[var(--chrome-bg-soft)] font-mono"
      :title="t('zoomOut')"
    >
      −
    </button>
    <button
      @click="emit('reset-zoom')"
      class="font-mono w-12 text-center text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] rounded py-0.5"
      :title="`${store.zoomLabel} (${t('zoomResetTitle')})`"
    >
      {{ store.zoomLabel }}
    </button>
    <button
      @click="emit('zoom-in')"
      class="px-2 py-0.5 rounded hover:bg-[var(--chrome-bg-soft)] font-mono"
      :title="t('zoomIn')"
    >
      +
    </button>
  </div>
</template>

<script setup lang="ts">
import { useDrawingStore } from '@/stores/drawing'
import { useLocale } from '@/composables/useLocale'

defineProps<{
  scrollMode: boolean
}>()

const emit = defineEmits<{
  (e: 'prev-page'): void
  (e: 'next-page'): void
  (e: 'add-page'): void
  (e: 'delete-page'): void
  (e: 'toggle-scroll'): void
  (e: 'zoom-in'): void
  (e: 'zoom-out'): void
  (e: 'reset-zoom'): void
}>()

const store = useDrawingStore()
const { t } = useLocale()
</script>
