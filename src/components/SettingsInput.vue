<template>
  <SettingsSection :title="t('secInput')">
    <div class="mt-3 pt-2 border-t border-[var(--chrome-border)]">
      <div class="mb-1 text-[var(--chrome-muted)]">
        {{ t('pressure') }} <span class="text-[var(--chrome-faint)]">{{ t('pressureOff') }}</span>
      </div>
      <input
        type="range"
        :min="SLIDERS.pressure.min"
        :max="SLIDERS.pressure.max"
        :step="SLIDERS.pressure.step"
        :value="store.pressureSensitivity"
        @input="store.setPressureSensitivity(Number(($event.target as HTMLInputElement).value))"
        class="w-full accent-indigo-600"
        :title="t('pressureTitle')"
      />
      <div class="mb-1 mt-2 text-[var(--chrome-muted)]">
        {{ t('smoothing') }} <span class="text-[var(--chrome-faint)]">{{ t('smoothingHint') }}</span>
      </div>
      <input
        type="range"
        :min="SLIDERS.smoothing.min"
        :max="SLIDERS.smoothing.max"
        :step="SLIDERS.smoothing.step"
        :value="store.smoothing"
        @input="store.setSmoothing(Number(($event.target as HTMLInputElement).value))"
        class="w-full accent-indigo-600"
        :title="t('smoothingTitle')"
      />
      <label class="flex items-center gap-2 mt-2 cursor-pointer" :title="t('palmRejectTitle')">
        <input
          type="checkbox"
          :checked="store.rejectTouch"
          @change="store.setRejectTouch(($event.target as HTMLInputElement).checked)"
          class="accent-indigo-600"
        />
        {{ t('palmReject') }}
      </label>
      <label class="flex items-center gap-2 mt-2 cursor-pointer" :title="t('touchPanTitle')">
        <input
          type="checkbox"
          :checked="store.touchPan"
          @change="store.setTouchPan(($event.target as HTMLInputElement).checked)"
          class="accent-indigo-600"
        />
        {{ t('touchPan') }}
      </label>
      <label class="flex items-center gap-2 mt-2 cursor-pointer" :title="t('autoShapeSnapTitle')">
        <input
          type="checkbox"
          :checked="store.autoShapeSnap"
          @change="store.setAutoShapeSnap(($event.target as HTMLInputElement).checked)"
          class="accent-indigo-600"
        />
        {{ t('autoShapeSnap') }}
      </label>
    </div>
  </SettingsSection>
</template>

<script setup lang="ts">
import { useDrawingStore } from '@/stores/drawing'
import { useLocale } from '@/composables/useLocale'
import { SLIDERS } from '@/config/ui'
import SettingsSection from '@/components/SettingsSection.vue'

const store = useDrawingStore()
const { t } = useLocale()
</script>
