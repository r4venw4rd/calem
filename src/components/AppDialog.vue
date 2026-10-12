<template>
  <div
    v-if="dialogOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
    role="dialog"
    aria-modal="true"
    :aria-label="dialogTitle"
    @pointerdown.self="dialogCancel"
  >
    <div
      ref="dialogPanel"
      class="w-[min(92vw,360px)] rounded-xl bg-[var(--chrome-bg)] border border-[var(--chrome-border-strong)] text-xs text-[var(--chrome-text)] shadow-2xl p-3"
      @keydown.tab="trapDialogFocus"
    >
      <div class="font-medium text-[var(--chrome-title)] mb-1">{{ dialogTitle }}</div>
      <div v-if="dialogMessage" class="text-[var(--chrome-muted)] mb-2">{{ dialogMessage }}</div>
      <input
        v-if="dialogKind === 'prompt'"
        ref="dialogInput"
        v-model="dialogText"
        class="w-full mb-2 px-2 py-1 rounded bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border-strong)] text-[var(--chrome-title)]"
        @keydown.enter.prevent="dialogOk"
      />
      <div class="flex justify-end gap-1">
        <button @click="dialogCancel" class="px-2 py-1 rounded hover:bg-[var(--chrome-bg-soft)]">
          {{ t('cancel') }}
        </button>
        <button @click="dialogOk" class="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium">
          {{ t('ok') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDialogs } from '@/composables/useDialogs'
import { useLocale } from '@/composables/useLocale'

const {
  dialogOpen,
  dialogKind,
  dialogTitle,
  dialogMessage,
  dialogText,
  dialogPanel,
  dialogInput,
  dialogOk,
  dialogCancel,
  trapIn,
} = useDialogs()

const { t } = useLocale()

const trapDialogFocus = (e: KeyboardEvent) => trapIn(dialogPanel.value, e)
</script>
