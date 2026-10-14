<template>
  <!-- İlk açılış onboarding'i: karşılama → cihaz profili → kurulum teşviği.
       Ayarlar yüklendikten SONRA gösterilir; tamamlanınca localStorage bayrağı yazılır. -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    :aria-label="t('welcomeTitle')"
  >
    <div
      class="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--chrome-border-strong)] bg-[var(--chrome-bg)] text-[var(--chrome-text)] shadow-2xl"
    >
      <!-- Dil: onboarding ayarlardan önce görünür, kullanıcı dili burada seçebilir. -->
      <div class="flex items-center justify-end gap-1 px-3 pt-3">
        <button
          v-for="l in LOCALES"
          :key="l.id"
          @click="store.setLocale(l.id)"
          class="rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide transition"
          :class="
            store.locale === l.id
              ? 'bg-indigo-600 text-white'
              : 'text-[var(--chrome-faint)] hover:bg-[var(--chrome-bg-soft)] hover:text-[var(--chrome-title)]'
          "
          :title="l.label"
        >
          {{ l.id }}
        </button>
      </div>

      <div class="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-2 pt-2">
        <!-- ADIM 0 — Karşılama + kalem vurgusu -->
        <template v-if="step === 0">
          <div class="flex flex-col items-center text-center">
            <img src="/icon-192.png" alt="Calem" class="h-16 w-16 rounded-2xl select-none" draggable="false" />
            <h1 class="mt-4 text-xl font-semibold text-[var(--chrome-title)]">{{ t('welcomeTitle') }}</h1>
            <p class="mt-2 max-w-sm text-sm leading-relaxed text-[var(--chrome-text)]">{{ t('welcomeTagline') }}</p>
            <span
              class="mt-4 inline-flex items-center gap-1.5 rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 text-[11px] font-medium text-indigo-300"
            >
              <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 19l7-7-4-4-7 7v4h4zM5 21h14" />
              </svg>
              {{ t('devRecommended') }}
            </span>
          </div>
        </template>

        <!-- ADIM 1 — Cihaz profili -->
        <template v-else-if="step === 1">
          <h2 class="text-base font-semibold text-[var(--chrome-title)]">{{ t('welcomeDeviceTitle') }}</h2>
          <p class="mt-1 text-xs leading-relaxed text-[var(--chrome-muted)]">{{ t('welcomeDeviceHint') }}</p>
          <div class="mt-4 flex flex-col gap-2" role="radiogroup">
            <button
              v-for="p in DEVICE_PROFILE_IDS"
              :key="p"
              @click="selected = p"
              role="radio"
              :aria-checked="selected === p"
              class="flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition"
              :class="
                selected === p
                  ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/60'
                  : 'border-[var(--chrome-border-strong)] hover:border-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)]'
              "
            >
              <span
                class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                :class="selected === p ? 'border-indigo-400' : 'border-[var(--chrome-border-strong)]'"
              >
                <span v-if="selected === p" class="h-2 w-2 rounded-full bg-indigo-500"></span>
              </span>
              <span class="min-w-0">
                <span class="flex flex-wrap items-center gap-1.5">
                  <span class="text-sm font-medium text-[var(--chrome-title)]">{{
                    t(DEVICE_PROFILE_META[p].labelKey)
                  }}</span>
                  <span
                    v-if="p === 'stylus'"
                    class="rounded-full bg-indigo-600/20 px-1.5 py-0.5 text-[10px] font-medium text-indigo-300"
                    >{{ t('devRecommended') }}</span
                  >
                </span>
                <span class="mt-0.5 block text-xs leading-relaxed text-[var(--chrome-muted)]">{{
                  t(DEVICE_PROFILE_META[p].descKey)
                }}</span>
              </span>
            </button>
          </div>
        </template>

        <!-- ADIM 2 — Uygulama olarak kur -->
        <template v-else>
          <div class="flex flex-col items-center text-center">
            <img src="/icon-192.png" alt="" class="h-12 w-12 rounded-xl select-none" draggable="false" />
            <h2 class="mt-3 text-base font-semibold text-[var(--chrome-title)]">{{ t('pwaTitle') }}</h2>
            <p class="mt-2 max-w-md text-xs leading-relaxed text-[var(--chrome-text)]">{{ t('welcomeInstallBody') }}</p>
          </div>
          <!-- Kurulabilir tarayıcı: prompt varsa doğrudan kur, yoksa manuel yol. -->
          <div v-if="pwaInstallSupported" class="mt-4">
            <button
              v-if="canPwaInstall"
              @click="installAndFinish"
              class="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500"
            >
              {{ t('pwaInstall') }}
            </button>
            <p v-else class="text-center text-xs text-[var(--chrome-muted)]">{{ t('pwaManual') }}</p>
          </div>
          <!-- Kurulumu desteklemeyen tarayıcı: Chrome/Edge önerisi. -->
          <div v-else class="mt-4 rounded-xl border border-[var(--chrome-border)] px-3 py-2 text-center">
            <div class="text-xs font-medium text-[var(--chrome-title)]">{{ t('pwaRecTitle') }}</div>
            <div class="mt-1 text-xs leading-relaxed text-[var(--chrome-muted)]">{{ t('pwaRec') }}</div>
          </div>
        </template>
      </div>

      <!-- Alt eylem çubuğu -->
      <div class="flex items-center justify-between gap-2 border-t border-[var(--chrome-border)] px-4 py-3">
        <button
          v-if="step > 0"
          @click="step -= 1"
          class="rounded-lg px-3 py-1.5 text-sm text-[var(--chrome-text)] transition hover:bg-[var(--chrome-bg-soft)]"
        >
          {{ t('welcomeBack') }}
        </button>
        <button
          v-else
          @click="finish(null)"
          class="rounded-lg px-3 py-1.5 text-sm text-[var(--chrome-faint)] transition hover:bg-[var(--chrome-bg-soft)] hover:text-[var(--chrome-text)]"
        >
          {{ t('welcomeSkip') }}
        </button>

        <div class="flex items-center gap-2">
          <span class="flex items-center gap-1" aria-hidden="true">
            <span
              v-for="i in 3"
              :key="i"
              class="h-1.5 rounded-full transition-all"
              :class="i - 1 === step ? 'w-4 bg-indigo-500' : 'w-1.5 bg-[var(--chrome-border-strong)]'"
            ></span>
          </span>
          <button
            v-if="step === 0"
            @click="step = 1"
            class="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            {{ t('welcomeStart') }}
          </button>
          <button
            v-else-if="step === 1"
            @click="step = 2"
            class="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            {{ t('welcomeNext') }}
          </button>
          <button
            v-else
            @click="finish(selected)"
            class="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            {{ t('welcomeFinish') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useDrawingStore } from '@/stores/drawing'
import { useLocale } from '@/composables/useLocale'
import { usePwaInstall } from '@/composables/usePwaInstall'
import { LOCALES } from '@/config/locale'
import { DEVICE_PROFILE_IDS, DEVICE_PROFILE_META } from '@/config/device'
import type { DeviceProfile } from '@/model/document'

const emit = defineEmits<{ (e: 'done', profile: DeviceProfile | null): void }>()

const store = useDrawingStore()
const { t } = useLocale()
const { canInstall: canPwaInstall, installSupported: pwaInstallSupported, install: installPwa } = usePwaInstall()

const step = ref(0)
// Önerilen: kalemli PC (uygulamanın birincil hedefi).
const selected = ref<DeviceProfile>('stylus')

const finish = (profile: DeviceProfile | null) => emit('done', profile)

// Kurulum prompt'unu aç, ardından akışı bitir (kullanıcı iptal etse de onboarding kapanır).
const installAndFinish = async () => {
  await installPwa()
  finish(selected.value)
}
</script>
