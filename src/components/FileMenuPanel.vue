<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="filePanelRef"
      class="fixed left-1/2 top-[68px] z-30 w-56 -translate-x-1/2 rounded-xl bg-[var(--float-bg)] border border-[var(--chrome-border-strong)] p-1.5 text-xs shadow-xl backdrop-blur"
      role="menu"
      :aria-label="t('file')"
    >
      <button
        @click="emit('open-calem')"
        :disabled="store.pdfBusy"
        class="block w-full text-left px-3 py-1.5 rounded text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] transition disabled:opacity-40 disabled:cursor-not-allowed"
        :title="t('openCalemTitle')"
      >
        {{ t('openCalem') }}
      </button>

      <button
        @click="emit('save-calem')"
        :disabled="store.pdfBusy"
        class="block w-full text-left px-3 py-1.5 rounded text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] transition disabled:opacity-40 disabled:cursor-not-allowed"
        :title="t('saveCalemTitle')"
      >
        {{ t('saveCalem') }}
      </button>

      <button
        @click="emit('open-xopp')"
        :disabled="store.pdfBusy"
        class="block w-full text-left px-3 py-1.5 rounded text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] transition disabled:opacity-40 disabled:cursor-not-allowed"
        :title="t('openXoppTitle')"
      >
        {{ t('openXopp') }}
      </button>

      <button
        @click="emit('export-xopp')"
        :disabled="store.pdfBusy"
        class="block w-full text-left px-3 py-1.5 rounded text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] transition disabled:opacity-40 disabled:cursor-not-allowed"
        :title="t('exportXoppTitle')"
      >
        {{ t('exportXopp') }}
      </button>

      <div class="my-1 border-t border-[var(--chrome-border)]"></div>

      <label
        class="block w-full text-left px-3 py-1.5 rounded text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] transition cursor-pointer"
        :class="{ 'opacity-40 pointer-events-none': store.pdfBusy }"
        :title="t('openPdfTitle')"
      >
        {{ t('openPdf') }}
        <input
          type="file"
          :accept="PDF_ACCEPT"
          class="hidden"
          :disabled="store.pdfBusy"
          @change="emit('pdf-file', $event)"
        />
      </label>

      <button
        @click="emit('export-pdf')"
        :disabled="store.pdfBusy"
        class="block w-full text-left px-3 py-1.5 rounded text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] transition disabled:opacity-40 disabled:cursor-not-allowed"
        :title="t('writePdfTitle')"
      >
        {{ t('writePdf') }}
      </button>

      <button
        @click="emit('export-png')"
        class="block w-full text-left px-3 py-1.5 rounded text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] transition"
        :title="t('downloadPngTitle')"
      >
        {{ t('downloadPng') }}
      </button>

      <div class="my-1 border-t border-[var(--chrome-border)]"></div>
      <div class="px-3 pt-1 text-[10px] text-[var(--chrome-faint)] font-mono">{{ t('page') }}</div>

      <button
        @click="emit('dup-page')"
        class="block w-full text-left px-3 py-1.5 rounded text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] transition"
        :title="t('dupPageTitle')"
      >
        {{ t('dupPage') }}
      </button>

      <div class="flex gap-1 px-3 pb-1">
        <button
          @click="emit('move-page-l')"
          :disabled="store.activePageIndex === 0"
          class="flex-1 px-2 py-1 rounded bg-[var(--chrome-bg-soft)] hover:bg-[var(--chrome-bg-soft)] transition disabled:opacity-40 disabled:cursor-not-allowed font-mono"
          :title="t('moveLeft')"
        >
          ←
        </button>
        <button
          @click="emit('move-page-r')"
          :disabled="store.activePageIndex >= store.pages.length - 1"
          class="flex-1 px-2 py-1 rounded bg-[var(--chrome-bg-soft)] hover:bg-[var(--chrome-bg-soft)] transition disabled:opacity-40 disabled:cursor-not-allowed font-mono"
          :title="t('moveRight')"
        >
          →
        </button>
      </div>

      <div
        v-if="store.pdfName || store.lastSavedAt || store.saveError"
        class="mt-1 pt-1 border-t border-[var(--chrome-border)] px-3 py-1 text-[10px] text-[var(--chrome-faint)] font-mono truncate"
      >
        <span v-if="store.pdfName" :title="store.pdfName">
          {{ store.pdfName }}
          <button @click="emit('close-pdf')" class="text-[var(--chrome-muted)] hover:text-[var(--chrome-title)] underline" :title="t('closePdf')">
            {{ t('close') }}
          </button>
        </span>
        <span v-if="store.lastSavedAt" :title="t('autosave')">
          {{ store.pdfName ? ' · ' : '' }}{{ t('saved') }} {{ store.lastSavedAt }}
        </span>
        <span v-if="store.saveError" class="text-red-500">{{ t('saveFailed') }}</span>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useDrawingStore } from '@/stores/drawing'
import { useLocale } from '@/composables/useLocale'
import { PDF_ACCEPT } from '@/config/files'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'open-calem'): void
  (e: 'save-calem'): void
  (e: 'open-xopp'): void
  (e: 'export-xopp'): void
  (e: 'pdf-file', event: Event): void
  (e: 'export-pdf'): void
  (e: 'export-png'): void
  (e: 'dup-page'): void
  (e: 'move-page-l'): void
  (e: 'move-page-r'): void
  (e: 'close-pdf'): void
}>()

const filePanelRef = ref<HTMLElement | null>(null)
defineExpose({ panelRef: filePanelRef, panelEl: filePanelRef })

const store = useDrawingStore()
const { t } = useLocale()
</script>
