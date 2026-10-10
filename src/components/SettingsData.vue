<template>
  <SettingsSection :title="t('secData')">
    <div class="mt-3 pt-2 border-t border-[var(--chrome-border)]">
      <div class="mb-1 text-[var(--chrome-muted)]">{{ t('settingsBackup') }}</div>
      <div class="flex gap-1">
        <button
          @click="backupSettings"
          class="flex-1 px-2 py-1 rounded bg-[var(--chrome-bg-soft)] hover:bg-[var(--chrome-bg-soft)] transition"
          :title="t('backupTitle')"
        >
          {{ t('backup') }}
        </button>
        <label
          class="flex-1 px-2 py-1 rounded bg-[var(--chrome-bg-soft)] hover:bg-[var(--chrome-bg-soft)] transition cursor-pointer text-center"
          :title="t('restoreTitle')"
        >
          {{ t('restore') }}
          <input type="file" :accept="SETTINGS_ACCEPT" class="hidden" @change="onSettingsFile" />
        </label>
      </div>
    </div>

    <div class="mt-3 pt-2 border-t border-[var(--chrome-border)]">
      <div class="mb-1 text-[var(--chrome-muted)]">{{ t('shortcuts') }}</div>
      <div class="font-mono text-[10px] leading-relaxed text-[var(--chrome-faint)]">
        <div>{{ t('sc1') }}</div>
        <div>{{ t('sc2') }}</div>
        <div>{{ t('sc3') }}</div>
        <div>{{ t('sc4') }}</div>
        <div>{{ t('sc5') }}</div>
        <div>{{ t('sc6') }}</div>
        <div>{{ t('sc7') }}</div>
        <div>{{ t('sc8') }}</div>
        <div>{{ t('sc9') }}</div>
      </div>
    </div>
  </SettingsSection>
</template>

<script setup lang="ts">
import { useDrawingStore } from '@/stores/drawing'
import { useLocale } from '@/composables/useLocale'
import { SETTINGS_ACCEPT, settingsBackupName } from '@/config/files'
import SettingsSection from '@/components/SettingsSection.vue'

const store = useDrawingStore()
const { t } = useLocale()

const emit = defineEmits<{ (e: 'error', message: string): void }>()

const backupSettings = () => {
  const blob = new Blob([store.exportSettingsJSON()], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = settingsBackupName()
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

const onSettingsFile = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  const ok = await store.importSettingsJSON(await f.text())
  if (!ok) emit('error', t('invalidSettings'))
}
</script>
