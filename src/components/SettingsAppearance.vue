<template>
  <SettingsSection :title="t('secAppearance')" open>
    <div class="mb-1 text-[var(--chrome-muted)]">{{ t('uiTheme') }}</div>
    <div class="flex gap-1 mb-3">
      <button
        @click="store.setUiTheme('koyu')"
        class="flex-1 px-2 py-1 rounded transition"
        :class="
          store.uiTheme === 'koyu'
            ? 'bg-indigo-600 text-white'
            : 'bg-[var(--chrome-bg-soft)] hover:bg-[var(--chrome-bg-soft)]'
        "
      >
        {{ t('dark') }}
      </button>
      <button
        @click="store.setUiTheme('acik')"
        class="flex-1 px-2 py-1 rounded transition"
        :class="
          store.uiTheme === 'acik'
            ? 'bg-indigo-600 text-white'
            : 'bg-[var(--chrome-bg-soft)] hover:bg-[var(--chrome-bg-soft)]'
        "
      >
        {{ t('light') }}
      </button>
    </div>

    <div class="mb-1 text-[var(--chrome-muted)]">{{ t('language') }}</div>
    <select
      :value="store.locale"
      @change="store.setLocale(($event.target as HTMLSelectElement).value)"
      :title="t('languageTitle')"
      class="w-full mb-3 px-2 py-1.5 rounded bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border-strong)] text-[var(--chrome-title)]"
    >
      <option v-for="l in LOCALES" :key="l.id" :value="l.id">{{ l.label }}</option>
    </select>

    <div class="mb-1 text-[var(--chrome-muted)]">{{ t('uiScale') }}</div>
    <div class="flex items-center gap-2 mb-3">
      <input
        type="range"
        :min="SLIDERS.uiScale.min"
        :max="SLIDERS.uiScale.max"
        :step="SLIDERS.uiScale.step"
        :value="store.uiScale"
        @input="store.setUiScale(Number(($event.target as HTMLInputElement).value))"
        class="flex-1 accent-indigo-600"
        :title="t('uiScale')"
      />
      <span class="text-xs text-[var(--chrome-text)] w-10 text-right font-mono"
        >{{ Math.round(store.uiScale * 100) }}%</span
      >
    </div>

    <div class="mb-1 text-[var(--chrome-muted)]">{{ t('paperTheme') }}</div>
    <div class="flex gap-2 mb-2">
      <button
        v-for="(hex, name) in PAPER_THEMES"
        :key="name"
        @click="store.setPaper(hex)"
        :title="String(name)"
        class="w-8 h-8 rounded-full border-2 transition"
        :class="
          store.paper === hex
            ? 'border-[var(--chrome-title)]'
            : 'border-[var(--chrome-border-strong)] hover:border-[var(--chrome-title)]'
        "
        :style="{ background: hex }"
      ></button>
    </div>

    <div class="flex gap-1 mb-2">
      <select
        :value="store.paperBackground.type"
        @change="
          store.setPaperBackground({
            type: ($event.target as HTMLSelectElement).value as typeof store.paperBackground.type,
          })
        "
        class="flex-1 px-2 py-1 rounded bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border-strong)] text-[var(--chrome-title)]"
        :title="t('paperPattern')"
      >
        <option value="blank">{{ t('blank') }}</option>
        <option value="ruled">{{ t('ruled') }}</option>
        <option value="graph">{{ t('graph') }}</option>
        <option value="dotted">{{ t('dottedBg') }}</option>
        <option value="staff">{{ t('staff') }}</option>
        <option value="isometric">{{ t('isometric') }}</option>
        <option value="cornell">{{ t('cornell') }}</option>
        <option value="planner">{{ t('planner') }}</option>
      </select>
      <input
        type="color"
        :value="store.paperBackground.lineColor"
        @input="store.setPaperBackground({ lineColor: ($event.target as HTMLInputElement).value })"
        class="w-8 h-8 rounded bg-transparent border border-[var(--chrome-border-strong)] cursor-pointer p-0.5"
        :title="t('patternColor')"
      />
    </div>

    <div v-if="store.paperBackground.type !== 'blank'" class="flex items-center gap-2 mb-2">
      <span class="text-[var(--chrome-faint)] whitespace-nowrap">{{ t('spacing') }}</span>
      <input
        type="range"
        :min="SLIDERS.paperSpacing.min"
        :max="SLIDERS.paperSpacing.max"
        :step="SLIDERS.paperSpacing.step"
        :value="store.paperBackground.spacing"
        @input="store.setPaperBackground({ spacing: Number(($event.target as HTMLInputElement).value) })"
        class="flex-1 accent-indigo-600"
        :title="t('spacingTitle')"
      />
      <span class="text-xs text-[var(--chrome-text)] w-6 text-right font-mono">{{
        store.paperBackground.spacing
      }}</span>
    </div>

    <label class="flex items-center gap-2 mb-3 cursor-pointer" :title="t('marginLineTitle')">
      <input
        type="checkbox"
        :checked="store.paperBackground.margin"
        @change="store.setPaperBackground({ margin: ($event.target as HTMLInputElement).checked })"
        class="accent-indigo-600"
      />
      {{ t('marginLine') }}
    </label>
  </SettingsSection>
</template>

<script setup lang="ts">
import { useDrawingStore } from '@/stores/drawing'
import { useLocale } from '@/composables/useLocale'
import { LOCALES } from '@/config/locale'
import { PAPER_THEMES } from '@/config/paper'
import { SLIDERS } from '@/config/ui'
import SettingsSection from '@/components/SettingsSection.vue'

const store = useDrawingStore()
const { t } = useLocale()
</script>
