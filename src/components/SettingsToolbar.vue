<template>
  <SettingsSection :title="t('secToolbar')">
    <div class="mb-1 text-[var(--chrome-muted)]">{{ t('toolbar') }}</div>
    <div class="flex flex-col gap-0.5 mb-3">
      <div
        v-for="(tool, i) in store.toolbarOrder"
        :key="tool"
        class="flex items-center gap-1 px-1 py-0.5 rounded hover:bg-[var(--chrome-bg-soft)]"
      >
        <input
          type="checkbox"
          :checked="!store.hiddenTools.includes(tool)"
          :disabled="!store.hiddenTools.includes(tool) && store.toolbarOrder.length - store.hiddenTools.length <= 1"
          @change="store.setToolVisible(tool, ($event.target as HTMLInputElement).checked)"
          class="accent-indigo-600"
          :title="`${locTools[tool].label} ${t('toolVisibilitySuffix')}`"
        />
        <span class="flex-1 truncate" :class="store.hiddenTools.includes(tool) ? 'opacity-40' : ''">
          {{ locTools[tool].label }}
        </span>
        <button
          @click="store.moveTool(tool, -1)"
          :disabled="i === 0"
          class="px-1 rounded hover:bg-[var(--chrome-bg-soft)] disabled:opacity-30 disabled:cursor-not-allowed font-mono"
          :title="t('moveFront')"
        >
          ↑
        </button>
        <button
          @click="store.moveTool(tool, 1)"
          :disabled="i === store.toolbarOrder.length - 1"
          class="px-1 rounded hover:bg-[var(--chrome-bg-soft)] disabled:opacity-30 disabled:cursor-not-allowed font-mono"
          :title="t('moveBack')"
        >
          ↓
        </button>
      </div>
      <button
        @click="store.resetToolbar()"
        class="mt-1 px-2 py-1 rounded bg-[var(--chrome-bg-soft)] hover:bg-[var(--chrome-bg-soft)] transition font-mono"
        :title="t('resetToolbarTitle')"
      >
        {{ t('reset') }}
      </button>
    </div>

    <div class="mb-1 text-[var(--chrome-muted)]">{{ t('palettes') }}</div>
    <div class="flex flex-col gap-0.5 mb-3">
      <div
        v-for="p in store.palettes"
        :key="p.id"
        class="flex items-center gap-1 px-1 py-0.5 rounded hover:bg-[var(--chrome-bg-soft)]"
        :class="{ 'bg-indigo-600/20': p.id === store.activePaletteId }"
      >
        <button
          @click="store.setActivePalette(p.id)"
          class="flex-1 min-w-0 text-left truncate px-1 py-0.5 rounded"
          :class="p.id === store.activePaletteId ? 'text-[var(--chrome-title)] font-medium' : 'text-[var(--chrome-text)]'"
          :title="`${t('makeActive')}: ${p.name} (${p.colors.length})`"
        >
          {{ p.name }}
          <span class="font-mono text-[10px] text-[var(--chrome-faint)]">{{ p.colors.length }}</span>
        </button>
        <span class="flex -space-x-1">
          <span
            v-for="hex in p.colors.slice(0, 6)"
            :key="hex"
            class="w-3.5 h-3.5 rounded-full border border-[var(--chrome-border-strong)]"
            :style="{ background: hex }"
          ></span>
        </span>
        <button
          @click="store.addColorToPalette(undefined, p.id)"
          class="px-1 rounded hover:bg-[var(--chrome-bg-soft)] font-mono"
          :title="t('addCurrentToPalette')"
        >
          +
        </button>
        <button
          @click="store.appendCustomsToPalette(p.id)"
          :disabled="store.customColors.length === 0"
          class="px-1 rounded hover:bg-[var(--chrome-bg-soft)] font-mono disabled:opacity-30 disabled:cursor-not-allowed"
          :title="t('addCustomsToPalette')"
        >
          C+
        </button>
        <button
          @click="renamePaletteBtn(p.id)"
          class="px-1 rounded hover:bg-[var(--chrome-bg-soft)]"
          :title="t('renameIt')"
        >
          {{ t('rename') }}
        </button>
        <button
          @click="askDeletePalette(p.id)"
          :disabled="store.palettes.length <= 1"
          class="px-1 rounded hover:bg-red-600/40 disabled:opacity-30 disabled:cursor-not-allowed"
          :title="t('deletePalette')"
        >
          {{ t('delete') }}
        </button>
      </div>
      <button
        @click="addPaletteBtn"
        class="mt-1 px-2 py-1 rounded bg-[var(--chrome-bg-soft)] hover:bg-[var(--chrome-bg-soft)] transition font-mono"
        :title="t('newPaletteTitle')"
      >
        {{ t('newPalette') }}
      </button>
    </div>
  </SettingsSection>
</template>

<script setup lang="ts">
import { useDrawingStore } from '@/stores/drawing'
import { useLocale } from '@/composables/useLocale'
import { useDialogs } from '@/composables/useDialogs'
import SettingsSection from '@/components/SettingsSection.vue'

const store = useDrawingStore()
const { t, locTools } = useLocale()
const { askConfirm, askPrompt } = useDialogs()

const addPaletteBtn = async () => {
  const name = await askPrompt('Palet adı', `Palet ${store.palettes.length + 1}`)
  if (name === null) return
  store.addPalette(name)
}

const askDeletePalette = async (id: string) => {
  const p = store.palettes.find((x) => x.id === id)
  if (!p || store.palettes.length <= 1) return
  if (!(await askConfirm(`"${p.name}" — ${t('paletteDeleteAsk')}`))) return
  store.deletePalette(id)
}

const renamePaletteBtn = async (id: string) => {
  const p = store.palettes.find((x) => x.id === id)
  if (!p) return
  const name = await askPrompt('Palet adı', p.name)
  if (name === null) return
  store.renamePalette(id, name)
}
</script>
