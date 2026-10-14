<template>
  <SettingsSection :title="t('secInput')">
    <!-- Cihaz profili: girdi varsayılanlarını tek tıkla uygular (onboarding'deki seçim).
         Tüm ayarlar görünür kalır; profil yalnızca ön tanımlı değerleri yazar. -->
    <div class="mb-1 text-[var(--chrome-muted)]">{{ t('deviceProfile') }}</div>
    <div class="flex gap-1 mb-1">
      <button
        v-for="p in DEVICE_PROFILE_IDS"
        :key="p"
        @click="store.applyDevicePreset(p)"
        class="flex-1 px-1.5 py-1 rounded text-[11px] leading-tight transition"
        :class="
          store.deviceProfile === p
            ? 'bg-indigo-600 text-white'
            : 'bg-[var(--chrome-bg-soft)] hover:bg-[var(--chrome-bg-soft)]'
        "
        :title="t(DEVICE_PROFILE_META[p].descKey)"
      >
        {{ t(DEVICE_PROFILE_META[p].labelKey) }}
      </button>
    </div>
    <div class="text-[10px] leading-relaxed text-[var(--chrome-faint)]">{{ t('deviceProfileHint') }}</div>

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
      <label class="flex items-center gap-2 mt-2 cursor-pointer" :title="t('twoFingerTapTitle')">
        <input
          type="checkbox"
          :checked="store.twoFingerTap"
          @change="store.setTwoFingerTap(($event.target as HTMLInputElement).checked)"
          class="accent-indigo-600"
        />
        {{ t('twoFingerTap') }}
      </label>
      <label class="flex items-center gap-2 mt-2 cursor-pointer" :title="t('threeFingerTapTitle')">
        <input
          type="checkbox"
          :checked="store.threeFingerTap"
          @change="store.setThreeFingerTap(($event.target as HTMLInputElement).checked)"
          class="accent-indigo-600"
        />
        {{ t('threeFingerTap') }}
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
import { DEVICE_PROFILE_IDS, DEVICE_PROFILE_META } from '@/config/device'
import SettingsSection from '@/components/SettingsSection.vue'

const store = useDrawingStore()
const { t } = useLocale()
</script>
