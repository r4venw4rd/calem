<template>
  <SettingsSection :title="t('secPage')">
    <div class="mb-1 text-[var(--chrome-muted)]">{{ t('pageFormat') }} <span class="text-[var(--chrome-faint)]">{{ t('newPages') }}</span></div>
    <select
      :value="store.pageFormat"
      @change="$emit('page-layout', store.setPageFormat(($event.target as HTMLSelectElement).value))"
      class="w-full px-2 py-1 rounded bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border-strong)] text-[var(--chrome-title)]"
    >
      <option v-for="(_, name) in PAGE_FORMATS" :key="name" :value="name">{{ name }}</option>
      <option value="custom">{{ t('custom') }}</option>
    </select>

    <div class="flex gap-1 mt-2">
      <button
        @click="$emit('page-layout', store.setPageOrientation('portrait'))"
        class="flex-1 px-2 py-1 rounded transition"
        :class="store.pageOrientation === 'portrait' ? 'bg-indigo-600 text-white' : 'bg-[var(--chrome-bg-soft)] hover:bg-[var(--chrome-bg-soft)]'"
      >
        {{ t('portrait') }}
      </button>
      <button
        @click="$emit('page-layout', store.setPageOrientation('landscape'))"
        class="flex-1 px-2 py-1 rounded transition"
        :class="store.pageOrientation === 'landscape' ? 'bg-indigo-600 text-white' : 'bg-[var(--chrome-bg-soft)] hover:bg-[var(--chrome-bg-soft)]'"
      >
        {{ t('landscape') }}
      </button>
    </div>

    <div v-if="store.pageFormat === 'custom'" class="flex items-center gap-2 mt-2">
      <label class="flex-1">
        <span class="text-[var(--chrome-faint)]">{{ t('widthLabel') }}</span>
        <input
          type="number"
          :min="PAGE_MIN"
          :max="PAGE_MAX"
          :value="store.customW"
          @change="$emit('page-layout', store.setCustomSize(Number(($event.target as HTMLInputElement).value), store.customH))"
          class="w-full px-2 py-1 rounded bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border-strong)] text-[var(--chrome-title)]"
        />
      </label>
      <label class="flex-1">
        <span class="text-[var(--chrome-faint)]">{{ t('heightLabel') }}</span>
        <input
          type="number"
          :min="PAGE_MIN"
          :max="PAGE_MAX"
          :value="store.customH"
          @change="$emit('page-layout', store.setCustomSize(store.customW, Number(($event.target as HTMLInputElement).value)))"
          class="w-full px-2 py-1 rounded bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border-strong)] text-[var(--chrome-title)]"
        />
      </label>
    </div>
  </SettingsSection>
</template>

<script setup lang="ts">
import { useDrawingStore } from '@/stores/drawing'
import { useLocale } from '@/composables/useLocale'
import { PAGE_FORMATS } from '@/config/paper'
import { PAGE_MAX, PAGE_MIN } from '@/config/engine'
import SettingsSection from '@/components/SettingsSection.vue'

const store = useDrawingStore()
const { t } = useLocale()

defineEmits<{ (e: 'page-layout', applied: boolean): void }>()
</script>
