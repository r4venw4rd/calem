<template>
  <div
    v-if="open"
    class="fixed inset-0 z-30 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50"
    @pointerdown.self="$emit('close')"
  >
    <div
      ref="panelEl"
      class="w-full sm:w-[min(94vw,400px)] h-[86vh] sm:h-auto sm:max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-xl bg-[var(--chrome-bg)] border border-[var(--chrome-border-strong)] text-xs text-[var(--chrome-text)] shadow-2xl"
      role="dialog"
      :aria-label="t('settings')"
      @keydown.tab="onTab"
    >
      <div class="flex items-center justify-between px-3 pt-3 pb-2">
        <span class="font-medium text-[var(--chrome-title)]">{{ t('settings') }}</span>
        <button @click="$emit('close')" class="text-[var(--chrome-faint)] hover:text-[var(--chrome-title)]" :title="t('doneTitle')">
          {{ t('close') }}
        </button>
      </div>

      <div class="overflow-y-auto px-3 pb-3">
        <SettingsAppearance />
        <SettingsToolbar />
        <SettingsPage @page-layout="$emit('page-layout', $event)" />
        <SettingsInput />
        <SettingsData @error="$emit('error', $event)" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useLocale } from '@/composables/useLocale'
import { useDialogs } from '@/composables/useDialogs'
import SettingsAppearance from '@/components/SettingsAppearance.vue'
import SettingsToolbar from '@/components/SettingsToolbar.vue'
import SettingsPage from '@/components/SettingsPage.vue'
import SettingsInput from '@/components/SettingsInput.vue'
import SettingsData from '@/components/SettingsData.vue'

defineProps<{ open: boolean }>()
defineEmits<{
  (e: 'close'): void
  (e: 'page-layout', applied: boolean): void
  (e: 'error', message: string): void
}>()

const { t } = useLocale()
const { trapIn } = useDialogs()

// Dışarı-tıkla kapatma + açılış odağı için (üst bileşen okur).
const panelEl = ref<HTMLElement | null>(null)
defineExpose({ panelEl })

const onTab = (e: KeyboardEvent) => trapIn(panelEl.value, e)
</script>
