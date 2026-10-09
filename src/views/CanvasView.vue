<template>
  <div class="h-screen flex flex-col bg-[var(--page-bg)] overflow-hidden">
    <header v-if="!presenting" class="relative z-10 shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 bg-[var(--chrome-bg)] border-b border-[var(--chrome-border)]">
      <img
        src="/icon-192.png"
        alt="Calem"
        title="Calem"
        class="h-7 w-7 rounded-md select-none"
        draggable="false"
      />
      <div ref="fileMenu" class="relative">
        <button
          @click="showFile = !showFile"
          class="px-3 py-1 rounded text-xs font-medium text-[var(--chrome-text)] hover:text-[var(--chrome-title)] transition"
          :class="{ 'bg-[var(--chrome-bg-soft)] text-[var(--chrome-title)]': showFile }"
          :title="t('fileOps')"
        >
          {{ t('file') }}
        </button>
        <div
          v-if="showFile"
          class="absolute left-0 top-full mt-1 z-20 w-56 rounded-lg bg-[var(--chrome-bg)] border border-[var(--chrome-border-strong)] p-1.5 text-xs shadow-xl"
          role="menu"
          :aria-label="t('file')"
        >
          <label
            class="block w-full text-left px-3 py-1.5 rounded text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] transition cursor-pointer"
            :class="{ 'opacity-40 pointer-events-none': store.pdfBusy }"
            :title="t('openCalemTitle')"
          >
            {{ t('openCalem') }}
            <input
              type="file"
              :accept="CALEM_ACCEPT"
              class="hidden"
              :disabled="store.pdfBusy"
              @change="onCalemFile"
            />
          </label>
          <button
            @click="exportCalemDoc"
            :disabled="store.pdfBusy"
            class="block w-full text-left px-3 py-1.5 rounded text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] transition disabled:opacity-40 disabled:cursor-not-allowed"
            :title="t('saveCalemTitle')"
          >
            {{ t('saveCalem') }}
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
              @change="onPdfFile"
            />
          </label>
          <button
            @click="exportPdfDoc"
            :disabled="store.pdfBusy"
            class="block w-full text-left px-3 py-1.5 rounded text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] transition disabled:opacity-40 disabled:cursor-not-allowed"
            :title="t('writePdfTitle')"
          >
            {{ t('writePdf') }}
          </button>
          <button
            @click="exportPng"
            class="block w-full text-left px-3 py-1.5 rounded text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] transition"
            :title="t('downloadPngTitle')"
          >
            {{ t('downloadPng') }}
          </button>
          <div class="my-1 border-t border-[var(--chrome-border)]"></div>
          <div class="px-3 pt-1 text-[10px] text-[var(--chrome-faint)] font-mono">{{ t('page') }}</div>
          <button
            @click="dupPage"
            class="block w-full text-left px-3 py-1.5 rounded text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] transition"
            :title="t('dupPageTitle')"
          >
            {{ t('dupPage') }}
          </button>
          <div class="flex gap-1 px-3 pb-1">
            <button
              @click="movePageL"
              :disabled="store.activePageIndex === 0"
              class="flex-1 px-2 py-1 rounded bg-[var(--chrome-bg-soft)] hover:bg-[var(--chrome-bg-soft)] transition disabled:opacity-40 disabled:cursor-not-allowed font-mono"
              :title="t('moveLeft')"
            >
              ←
            </button>
            <button
              @click="movePageR"
              :disabled="store.activePageIndex >= store.pages.length - 1"
              class="flex-1 px-2 py-1 rounded bg-[var(--chrome-bg-soft)] hover:bg-[var(--chrome-bg-soft)] transition disabled:opacity-40 disabled:cursor-not-allowed font-mono"
              :title="t('moveRight')"
            >
              →
            </button>
          </div>
          <div
            v-if="store.pdfName || store.lastSavedAt"
            class="mt-1 pt-1 border-t border-[var(--chrome-border)] px-3 py-1 text-[10px] text-[var(--chrome-faint)] font-mono truncate"
          >
            <span v-if="store.pdfName" :title="store.pdfName">
              {{ store.pdfName }}
              <button @click="askClosePdf" class="text-[var(--chrome-muted)] hover:text-[var(--chrome-title)] underline" :title="t('closePdf')">
                {{ t('close') }}
              </button>
            </span>
            <span v-if="store.lastSavedAt" :title="t('autosave')">
              {{ store.pdfName ? ' · ' : '' }}{{ t('saved') }} {{ store.lastSavedAt }}
            </span>
          </div>
        </div>
      </div>

      <div ref="settingsBtn" class="relative">
        <button
          @click="showSettings = !showSettings; showLayers = false"
          class="px-3 py-1 rounded text-xs font-medium text-[var(--chrome-text)] hover:text-[var(--chrome-title)] transition"
          :class="{ 'bg-[var(--chrome-bg-soft)] text-[var(--chrome-title)]': showSettings }"
          :title="t('settings')"
        >
          {{ t('settings') }}
        </button>
      </div>

      <div ref="layersBtn" class="relative">
        <button
          @click="showLayers = !showLayers; showSettings = false"
          class="px-3 py-1 rounded text-xs font-medium text-[var(--chrome-text)] hover:text-[var(--chrome-title)] transition"
          :class="{ 'bg-[var(--chrome-bg-soft)] text-[var(--chrome-title)]': showLayers }"
          :title="t('layersTitle')"
        >
          {{ t('layers') }} ({{ store.activePage.layers.length }})
        </button>
      </div>

      <label class="flex items-center gap-1 px-2 py-1 rounded text-xs text-[var(--chrome-text)]" :title="t('languageTitle')">
        <span class="font-medium">🌐</span>
        <select
          :value="store.locale"
          @change="store.setLocale(($event.target as HTMLSelectElement).value)"
          class="px-1.5 py-1 rounded bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border-strong)] text-xs text-[var(--chrome-title)]"
        >
          <option v-for="l in LOCALES" :key="l.id" :value="l.id">{{ l.label }}</option>
        </select>
      </label>

      <div class="flex items-center gap-1 p-1 rounded-lg bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border)]" role="toolbar" :aria-label="t('tools')">
        <button
          v-for="tool in visibleTools"
          :key="tool"
          @click="store.setTool(tool)"
          :class="store.currentTool === tool ? TOOL_META[tool].active : 'text-[var(--chrome-text)] hover:text-[var(--chrome-title)]'"
          class="px-2 py-1 rounded text-xs font-medium transition flex items-center gap-1"
          :title="locTools[tool].title"
        >
          <svg v-if="TOOL_META[tool].icon === 'pen'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7l7 9z" />
          </svg>
          <svg v-else-if="TOOL_META[tool].icon === 'hl'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 11l3 3m-2.5-2.5L4 17l5-1.5L19.5 5 15 3.5 9.5 8.5z" />
          </svg>
          <svg v-else-if="TOOL_META[tool].icon === 'eraser'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.832A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.832L3 7m12 4h4m4-4v4m-4-6h4m-5.303-5.303L16 16" />
          </svg>
          <svg v-else-if="TOOL_META[tool].icon === 'select'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3l14 7-6 2-2 6-6-15z" />
          </svg>
          {{ locTools[tool].label }}
        </button>
      </div>

      <div
        v-if="store.currentTool === 'select'"
        class="flex items-center gap-1 p-1 rounded-lg bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border)]"
        role="toolbar"
        :aria-label="t('selOps')"
      >
        <button
          @click="store.setSelectMode('rect')"
          :class="store.selectMode === 'rect' ? 'bg-indigo-600 text-white' : 'text-[var(--chrome-text)] hover:text-[var(--chrome-title)]'"
          class="px-2 py-1 rounded text-xs font-medium transition"
          :title="t('rectSelTitle')"
        >
          {{ t('rectSel') }}
        </button>
        <button
          @click="store.setSelectMode('lasso')"
          :class="store.selectMode === 'lasso' ? 'bg-indigo-600 text-white' : 'text-[var(--chrome-text)] hover:text-[var(--chrome-title)]'"
          class="px-2 py-1 rounded text-xs font-medium transition"
          :title="t('lassoSelTitle')"
        >
          {{ t('lassoSel') }}
        </button>
        <span class="w-px h-4 bg-[var(--chrome-border)]"></span>
        <button
          @click="selAll"
          class="px-2 py-1 rounded text-xs text-[var(--chrome-text)] hover:text-[var(--chrome-title)] transition"
          :title="t('selectAllTitle')"
        >
          {{ t('selectAll') }}
        </button>
        <button
          @click="selCopy"
          :disabled="store.selectionCount === 0"
          class="px-2 py-1 rounded text-xs text-[var(--chrome-text)] hover:text-[var(--chrome-title)] transition disabled:opacity-40 disabled:cursor-not-allowed"
          :title="t('copyTitle')"
        >
          {{ t('copy') }}
        </button>
        <button
          @click="selPaste"
          :disabled="store.clipboardCount === 0"
          class="px-2 py-1 rounded text-xs text-[var(--chrome-text)] hover:text-[var(--chrome-title)] transition disabled:opacity-40 disabled:cursor-not-allowed"
          :title="t('pasteTitle')"
        >
          {{ t('paste') }}
        </button>
        <button
          @click="selDelete"
          :disabled="store.selectionCount === 0"
          class="px-2 py-1 rounded text-xs text-[var(--chrome-text)] hover:text-red-400 transition disabled:opacity-40 disabled:cursor-not-allowed"
          :title="t('delSelTitle')"
        >
          {{ t('delSel') }}<span v-if="store.selectionCount > 0" class="font-mono"> ({{ store.selectionCount }})</span>
        </button>
      </div>

      <div v-if="store.currentTool !== 'select'" class="flex flex-col gap-1" role="toolbar" :aria-label="t('palette')">
        <div class="flex items-center gap-1.5">
          <select
            :value="store.activePaletteId"
            @change="store.setActivePalette(($event.target as HTMLSelectElement).value)"
            class="max-w-24 px-1.5 py-1 rounded bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border-strong)] text-xs text-[var(--chrome-title)]"
            :title="t('paletteTitle')"
          >
            <option v-for="p in store.palettes" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <span
            v-for="hex in store.activePalette.colors"
            :key="hex"
            class="relative group shrink-0"
          >
            <button
              @click="store.setColor(hex)"
              :title="hex"
              class="w-6 h-6 rounded-full border transition block"
              :class="store.color.toLowerCase() === hex ? 'border-[var(--chrome-title)] scale-110' : 'border-[var(--chrome-border-strong)] hover:border-[var(--chrome-title)]'"
              :style="{ background: hex }"
            ></button>
            <button
              @click="store.removeColorFromPalette(hex)"
              :title="t('removeFromPalette')"
              class="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 hidden group-hover:flex group-focus-within:flex pointer-coarse:flex items-center justify-center rounded-full bg-[var(--chrome-bg-solid)] border border-[var(--chrome-border-strong)] text-[9px] leading-none text-[var(--chrome-text)]"
            >
              ×
            </button>
          </span>
        </div>
        <div class="flex items-center gap-1.5">
          <input
            ref="customPicker"
            type="color"
            :value="store.color"
            @input="onCustomInput(($event.target as HTMLInputElement).value)"
            @cancel="pickerArmed = false"
            class="w-6 h-6 rounded-full bg-transparent border border-dashed border-[var(--chrome-border-strong)] cursor-pointer p-0 shrink-0"
            :title="t('customColor')"
          />
          <span
            v-for="i in CUSTOM_SLOT_COUNT"
            :key="'c' + i"
            class="relative group shrink-0"
          >
            <button
              v-if="store.customColors[i - 1]"
              @click="store.setColor(store.customColors[i - 1]!); editingCustom = null"
              :title="`${store.customColors[i - 1]} ${t('editCustomSuffix')}`"
              class="w-6 h-6 rounded-full border transition block"
              :class="[
                store.color.toLowerCase() === store.customColors[i - 1] ? 'border-[var(--chrome-title)] scale-110' : 'border-[var(--chrome-border-strong)] hover:border-[var(--chrome-title)]',
                editingCustom === i - 1 ? 'ring-2 ring-indigo-500' : '',
              ]"
              :style="{ background: store.customColors[i - 1] }"
            ></button>
            <button
              v-else
              @click="pickCustom()"
              :title="t('openPicker')"
              class="w-6 h-6 rounded-full border border-dashed border-[var(--chrome-border-strong)] text-xs text-[var(--chrome-text)] hover:text-[var(--chrome-title)] transition font-mono block"
            >
              +
            </button>
            <button
              v-if="store.customColors[i - 1]"
              @click="store.removeCustomColor(store.customColors[i - 1]!)"
              :title="t('removeCustom')"
              class="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 hidden group-hover:flex group-focus-within:flex pointer-coarse:flex items-center justify-center rounded-full bg-[var(--chrome-bg-solid)] border border-[var(--chrome-border-strong)] text-[9px] leading-none text-[var(--chrome-text)]"
            >
              ×
            </button>
            <button
              v-if="store.customColors[i - 1]"
              @click="editingCustom = i - 1"
              :title="t('editCustom')"
              class="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 hidden group-hover:flex group-focus-within:flex pointer-coarse:flex items-center justify-center rounded-full bg-[var(--chrome-bg-solid)] border border-[var(--chrome-border-strong)] text-[9px] leading-none text-[var(--chrome-text)]"
            >
              ✎
            </button>
          </span>
        </div>
      </div>

      <div v-if="store.currentTool !== 'select' && store.currentTool !== 'text' && store.currentTool !== 'image' && store.currentTool !== 'hand'" class="flex items-center gap-2">
        <span class="text-sm text-[var(--chrome-muted)]">{{ t('width') }}</span>
        <input
          type="range"
          :min="store.widthMin"
          :max="store.widthMax"
          :value="store.strokeWidth"
          @input="store.setStrokeWidth(Number(($event.target as HTMLInputElement).value))"
          class="w-24 accent-indigo-600"
        />
        <span class="text-xs text-[var(--chrome-text)] w-6 text-right">{{ store.strokeWidth }}</span>
        <template v-if="['pen', 'line', 'rect', 'ellipse', 'arrow'].includes(store.currentTool)">
          <span class="w-px h-4 bg-[var(--chrome-border)]"></span>
          <select
            :value="store.strokeDash"
            @change="store.setStrokeDash(($event.target as HTMLSelectElement).value)"
            class="px-1.5 py-1 rounded bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border-strong)] text-xs text-[var(--chrome-title)]"
            :title="t('lineStyle')"
          >
            <option value="solid">{{ t('solid') }}</option>
            <option value="dash">{{ t('dashed') }}</option>
            <option value="dot">{{ t('dotted') }}</option>
          </select>
          <input
            type="range"
            :min="SLIDERS.opacity.min"
            :max="SLIDERS.opacity.max"
            :step="SLIDERS.opacity.step"
            :value="store.strokeOpacity"
            @input="store.setStrokeOpacity(Number(($event.target as HTMLInputElement).value))"
            class="w-16 accent-indigo-600"
            :title="t('opacity')"
          />
          <span class="text-xs text-[var(--chrome-text)] w-8 text-right font-mono">{{ Math.round(store.strokeOpacity * 100) }}%</span>
        </template>
        <template v-if="store.currentTool === 'eraser'">
          <span class="w-px h-4 bg-[var(--chrome-border)]"></span>
          <button
            @click="store.setEraserMode('standard')"
            :class="store.eraserMode === 'standard' ? 'bg-indigo-600 text-white' : 'text-[var(--chrome-text)] hover:text-[var(--chrome-title)]'"
            class="px-2 py-1 rounded text-xs font-medium transition"
            :title="t('eraserStandardTitle')"
          >
            {{ t('eraserStandard') }}
          </button>
          <button
            @click="store.setEraserMode('stroke')"
            :class="store.eraserMode === 'stroke' ? 'bg-indigo-600 text-white' : 'text-[var(--chrome-text)] hover:text-[var(--chrome-title)]'"
            class="px-2 py-1 rounded text-xs font-medium transition"
            :title="t('eraserStrokeTitle')"
          >
            {{ t('eraserStroke') }}
          </button>
        </template>
      </div>

      <div v-if="store.currentTool === 'text'" class="flex items-center gap-2">
        <span class="text-sm text-[var(--chrome-muted)]">{{ t('textLabel') }}</span>
        <input
          type="range"
          :min="SLIDERS.textSize.min"
          :max="SLIDERS.textSize.max"
          :step="SLIDERS.textSize.step"
          :value="store.textSize"
          @input="store.setTextSize(Number(($event.target as HTMLInputElement).value))"
          class="w-24 accent-indigo-600"
          :title="t('textSizeTitle')"
        />
        <span class="text-xs text-[var(--chrome-text)] w-6 text-right">{{ store.textSize }}</span>
      </div>

      <button
        @click="undo"
        :disabled="store.undoStack.length === 0"
        class="px-3 py-1 rounded text-xs font-medium text-[var(--chrome-text)] hover:text-[var(--chrome-title)] transition disabled:opacity-40 disabled:cursor-not-allowed"
        :title="t('undoTitle')"
      >
        {{ t('undo') }}
      </button>

      <button
        @click="redo"
        :disabled="store.redoStack.length === 0"
        class="px-3 py-1 rounded text-xs font-medium text-[var(--chrome-text)] hover:text-[var(--chrome-title)] transition disabled:opacity-40 disabled:cursor-not-allowed"
        :title="t('redoTitle')"
      >
        {{ t('redo') }}
      </button>

      <span v-if="store.pdfBusy" class="text-[10px] text-yellow-400/80 font-mono">{{ t('processing') }}</span>
      <span v-if="pdfError" class="text-[10px] text-red-400 font-mono">{{ pdfError }}</span>

      <div
        v-if="showSettings"
        class="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/50"
        @pointerdown.self="showSettings = false"
      >
      <div
        ref="settingsPanel"
        class="w-[min(92vw,380px)] max-h-[85vh] flex flex-col rounded-xl bg-[var(--chrome-bg)] border border-[var(--chrome-border-strong)] text-xs text-[var(--chrome-text)] shadow-2xl"
        role="dialog"
        :aria-label="t('settings')"
        @keydown.tab="trapFocus"
      >
        <div class="flex items-center justify-between px-3 pt-3 pb-2">
          <span class="font-medium text-[var(--chrome-title)]">{{ t('settings') }}</span>
          <button @click="showSettings = false" class="text-[var(--chrome-faint)] hover:text-[var(--chrome-title)]" :title="t('doneTitle')">
            {{ t('close') }}
          </button>
        </div>

        <div class="overflow-y-auto px-3 pb-3">
        <div class="mb-1 text-[var(--chrome-muted)]">{{ t('uiTheme') }}</div>
        <div class="flex gap-1 mb-3">
          <button
            @click="store.setUiTheme('koyu')"
            class="flex-1 px-2 py-1 rounded transition"
            :class="store.uiTheme === 'koyu' ? 'bg-indigo-600 text-white' : 'bg-[var(--chrome-bg-soft)] hover:bg-[var(--chrome-bg-soft)]'"
          >
            {{ t('dark') }}
          </button>
          <button
            @click="store.setUiTheme('acik')"
            class="flex-1 px-2 py-1 rounded transition"
            :class="store.uiTheme === 'acik' ? 'bg-indigo-600 text-white' : 'bg-[var(--chrome-bg-soft)] hover:bg-[var(--chrome-bg-soft)]'"
          >
            {{ t('light') }}
          </button>
        </div>

        <div class="mb-1 text-[var(--chrome-muted)]">{{ t('paperTheme') }}</div>
        <div class="flex gap-2 mb-2">
          <button
            v-for="(hex, name) in PAPER_THEMES"
            :key="name"
            @click="store.setPaper(hex)"
            :title="String(name)"
            class="w-8 h-8 rounded-full border-2 transition"
            :class="store.paper === hex ? 'border-[var(--chrome-title)]' : 'border-[var(--chrome-border-strong)] hover:border-[var(--chrome-title)]'"
            :style="{ background: hex }"
          ></button>
        </div>

        <div class="flex gap-1 mb-2">
          <select
            :value="store.paperBackground.type"
            @change="store.setPaperBackground({ type: ($event.target as HTMLSelectElement).value as typeof store.paperBackground.type })"
            class="flex-1 px-2 py-1 rounded bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border-strong)] text-[var(--chrome-title)]"
            :title="t('paperPattern')"
          >
            <option value="blank">{{ t('blank') }}</option>
            <option value="ruled">{{ t('ruled') }}</option>
            <option value="graph">{{ t('graph') }}</option>
            <option value="dotted">{{ t('dottedBg') }}</option>
            <option value="staff">{{ t('staff') }}</option>
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
          <span class="text-xs text-[var(--chrome-text)] w-6 text-right font-mono">{{ store.paperBackground.spacing }}</span>
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

        <div class="mb-1 text-[var(--chrome-muted)]">{{ t('pageFormat') }} <span class="text-[var(--chrome-faint)]">{{ t('newPages') }}</span></div>
        <select
          :value="store.pageFormat"
          @change="store.setPageFormat(($event.target as HTMLSelectElement).value)"
          class="w-full px-2 py-1 rounded bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border-strong)] text-[var(--chrome-title)]"
        >
          <option v-for="(_, name) in PAGE_FORMATS" :key="name" :value="name">{{ name }}</option>
          <option value="custom">{{ t('custom') }}</option>
        </select>

        <div class="flex gap-1 mt-2">
          <button
            @click="store.setPageOrientation('portrait')"
            class="flex-1 px-2 py-1 rounded transition"
            :class="store.pageOrientation === 'portrait' ? 'bg-indigo-600 text-white' : 'bg-[var(--chrome-bg-soft)] hover:bg-[var(--chrome-bg-soft)]'"
          >
            {{ t('portrait') }}
          </button>
          <button
            @click="store.setPageOrientation('landscape')"
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
              @change="store.setCustomSize(Number(($event.target as HTMLInputElement).value), store.customH)"
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
              @change="store.setCustomSize(store.customW, Number(($event.target as HTMLInputElement).value))"
              class="w-full px-2 py-1 rounded bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border-strong)] text-[var(--chrome-title)]"
            />
          </label>
        </div>

        <div class="mt-3 pt-2 border-t border-[var(--chrome-border)]">
          <div class="mb-1 text-[var(--chrome-muted)]">{{ t('pressure') }} <span class="text-[var(--chrome-faint)]">{{ t('pressureOff') }}</span></div>
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
          <div class="mb-1 mt-2 text-[var(--chrome-muted)]">{{ t('smoothing') }} <span class="text-[var(--chrome-faint)]">{{ t('smoothingHint') }}</span></div>
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
        </div>

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
          </div>
        </div>
        </div>
      </div>
      </div>

      <div
        ref="layersPanel"
        v-if="showLayers"
        class="absolute left-2 top-full mt-1 z-20 w-64 rounded-lg bg-[var(--chrome-bg)] border border-[var(--chrome-border-strong)] p-3 text-xs text-[var(--chrome-text)] shadow-xl"
        role="dialog"
        :aria-label="t('layersDialog')"
      >
        <div class="flex items-center justify-between mb-2">
          <span class="font-medium text-[var(--chrome-title)]">{{ t('layersDialog') }} <span class="text-[var(--chrome-faint)]">{{ t('layersOnTop') }}</span></span>
          <button @click="showLayers = false" class="text-[var(--chrome-faint)] hover:text-[var(--chrome-title)]" :title="t('close')">
            {{ t('close') }}
          </button>
        </div>

        <div
          v-for="(l, ri) in layersTopFirst"
          :key="l.id"
          class="flex items-center gap-1 px-1 py-0.5 rounded"
          :class="l.id === store.activePage.activeLayerId ? 'bg-indigo-600/20' : 'hover:bg-[var(--chrome-bg-soft)]'"
        >
          <input
            type="checkbox"
            :checked="l.visible"
            @change="store.toggleLayerVisible(l.id)"
            class="accent-indigo-600"
            :title="t('visibility')"
          />
          <button
            @click="activateLayer(l.id)"
            class="flex-1 min-w-0 text-left truncate px-1 py-0.5 rounded"
            :class="l.id === store.activePage.activeLayerId ? 'text-[var(--chrome-title)] font-medium' : 'text-[var(--chrome-text)]'"
            :title="`${t('makeActive')}: ${l.name}`"
          >
            {{ l.name }}
            <span class="font-mono text-[10px] text-[var(--chrome-faint)]">{{ l.strokes.length }}</span>
          </button>
          <button
            @click="store.moveLayer(l.id, 1)"
            :disabled="ri === 0"
            class="px-1 rounded hover:bg-[var(--chrome-bg-soft)] disabled:opacity-30 disabled:cursor-not-allowed font-mono"
            :title="t('moveUp')"
          >
            ↑
          </button>
          <button
            @click="store.moveLayer(l.id, -1)"
            :disabled="ri === layersTopFirst.length - 1"
            class="px-1 rounded hover:bg-[var(--chrome-bg-soft)] disabled:opacity-30 disabled:cursor-not-allowed font-mono"
            :title="t('moveDown')"
          >
            ↓
          </button>
          <button
            @click="renameLayer(l.id)"
            class="px-1 rounded hover:bg-[var(--chrome-bg-soft)]"
            :title="t('nameLayer')"
          >
            {{ t('rename') }}
          </button>
          <button
            @click="askDeleteLayer(l.id)"
            class="px-1 rounded hover:bg-red-600/40"
            :title="t('deleteLayer')"
          >
            {{ t('delete') }}
          </button>
        </div>

        <button
          @click="addLayerBtn"
          class="mt-2 w-full px-2 py-1 rounded bg-[var(--chrome-bg-soft)] hover:bg-[var(--chrome-bg-soft)] transition font-mono"
          :title="t('newLayerTitle')"
        >
          {{ t('newLayer') }}
        </button>
      </div>

      <button
        @click="askClearCanvas"
        class="px-3 py-1 rounded text-xs font-medium text-red-400 hover:text-red-300 transition flex items-center gap-1"
        :title="t('clearTitle')"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.832A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.832L3 7m12 4h4m4-4v4m-4-6h4m-5.303-5.303L16 16" />
        </svg>
        {{ t('clear') }}
      </button>

      <button
        @click="togglePresent"
        class="px-3 py-1 rounded text-xs font-medium text-[var(--chrome-text)] hover:text-[var(--chrome-title)] transition"
        :title="t('presentTitle')"
      >
        {{ t('present') }}
      </button>
    </header>

    <div class="relative flex-1 bg-[var(--page-bg)] min-h-0">
      <!-- Tekli mod: tam-alan canlı canvas. Kaydırmalı mod: statik bloklar + aktif slota yüzen canlı canvas. -->
      <template v-if="!scrollMode">
        <canvas
          ref="baseCanvas"
          class="absolute inset-0 w-full h-full block"
        ></canvas>
        <canvas
          ref="overlayCanvas"
          class="absolute inset-0 w-full h-full touch-none select-none block"
          :style="{ cursor: store.currentTool === 'text' ? 'text' : store.currentTool === 'image' ? 'copy' : store.currentTool === 'hand' ? 'grab' : store.currentTool === 'select' ? 'default' : 'crosshair' }"
          @pointerdown="startDraw"
          @pointermove="draw"
          @pointerup="endDraw"
          @pointerleave="endDraw"
          @pointercancel="endDraw"
        ></canvas>
      </template>
      <div v-else ref="scrollBox" class="absolute inset-0 overflow-y-auto">
        <div class="mx-auto w-full max-w-[860px] px-3 pt-3 pb-28 flex flex-col gap-4">
          <div
            v-for="(p, i) in store.pages"
            :key="p.id"
            :ref="(el) => setBlockRef(el, p.id)"
            class="w-full rounded-sm overflow-hidden"
            :style="{ aspectRatio: `${p.size.w} / ${p.size.h}`, visibility: i === store.activePageIndex ? 'hidden' : 'visible' }"
          ></div>
        </div>
        <div ref="activeSlot" class="absolute" style="display: none">
          <canvas
            ref="baseCanvas"
            class="absolute inset-0 w-full h-full block"
          ></canvas>
          <canvas
            ref="overlayCanvas"
            class="absolute inset-0 w-full h-full touch-none select-none block"
            :style="{ cursor: store.currentTool === 'text' ? 'text' : store.currentTool === 'image' ? 'copy' : store.currentTool === 'hand' ? 'grab' : store.currentTool === 'select' ? 'default' : 'crosshair' }"
            @pointerdown="startDraw"
            @pointermove="draw"
            @pointerup="endDraw"
            @pointerleave="endDraw"
            @pointercancel="endDraw"
          ></canvas>
        </div>
      </div>
      <input
        ref="imgInput"
        type="file"
        :accept="IMAGE_ACCEPT"
        class="hidden"
        @change="onImageFile"
      />

      <div
        v-if="store.currentTool === 'text' && store.activeTextId && !presenting"
        class="absolute top-3 left-1/2 -translate-x-1/2 z-10 w-80 rounded-lg bg-[var(--chrome-bg)] border border-[var(--chrome-border-strong)] p-3 text-xs text-[var(--chrome-text)] shadow-xl"
        role="dialog"
        :aria-label="t('textEditor')"
      >
        <textarea
          ref="textArea"
          rows="3"
          :value="store.activeText()?.text ?? ''"
          @input="onTextInput"
          @keydown.escape="closeTextEditor"
          :placeholder="t('textPlaceholder')"
          class="w-full px-2 py-1.5 rounded bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border-strong)] text-[var(--chrome-title)] resize-y"
        ></textarea>
        <div class="flex items-center gap-2 mt-2">
          <input
            type="range"
            :min="SLIDERS.textSize.min"
            :max="SLIDERS.textSize.max"
            :step="SLIDERS.textSize.step"
            :value="store.activeText()?.size ?? store.textSize"
            @input="onTextSizeInput(Number(($event.target as HTMLInputElement).value))"
            class="flex-1 accent-indigo-600"
            :title="t('textSizeShort')"
          />
          <input
            type="color"
            :value="store.activeText()?.color ?? store.color"
            @input="onTextColorInput(($event.target as HTMLInputElement).value)"
            class="w-7 h-7 rounded bg-transparent border border-[var(--chrome-border-strong)] cursor-pointer p-0.5"
            :title="t('textColor')"
          />
          <button
            @click="delActiveText"
            class="px-2 py-1 rounded hover:bg-red-600/40 text-[var(--chrome-text)] hover:text-[var(--chrome-title)] transition"
            :title="t('delText')"
          >
            {{ t('delete') }}
          </button>
          <button
            @click="closeTextEditor"
            class="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
            :title="t('doneTitle')"
          >
            {{ t('done') }}
          </button>
        </div>
      </div>

      <div
        v-if="store.currentTool === 'image' && store.activeImageId && !presenting"
        class="absolute top-3 left-1/2 -translate-x-1/2 z-10 w-72 rounded-lg bg-[var(--chrome-bg)] border border-[var(--chrome-border-strong)] p-3 text-xs text-[var(--chrome-text)] shadow-xl"
        role="dialog"
        :aria-label="t('imageEditor')"
      >
        <div class="flex items-center justify-between mb-2">
          <span class="font-medium text-[var(--chrome-title)] font-mono">
            {{ t('imgLabel') }} {{ store.activeImage()?.w }}×{{ store.activeImage()?.h }}
          </span>
          <span v-if="store.imgBusy" class="text-[10px] text-yellow-400/80 font-mono">{{ t('processing') }}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[var(--chrome-faint)] whitespace-nowrap">{{ t('imgSize') }}</span>
          <input
            type="range"
            :min="SLIDERS.imageWidth.min"
            :max="SLIDERS.imageWidth.max"
            :step="SLIDERS.imageWidth.step"
            :value="store.activeImage()?.w ?? 200"
            @input="onImgWidth(Number(($event.target as HTMLInputElement).value))"
            class="flex-1 accent-indigo-600"
            :title="t('imgSizeTitle')"
          />
        </div>
        <div class="flex items-center gap-2 mt-2">
          <button
            @click="delActiveImage"
            class="px-2 py-1 rounded hover:bg-red-600/40 text-[var(--chrome-text)] hover:text-[var(--chrome-title)] transition"
            :title="t('delImage')"
          >
            {{ t('delete') }}
          </button>
          <button
            @click="store.activeImageId = null"
            class="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
            :title="t('doneTitle')"
          >
            {{ t('done') }}
          </button>
        </div>
      </div>

      <div
        class="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--chrome-bg)] border border-[var(--chrome-border)] text-xs text-[var(--chrome-text)] select-none"
        role="navigation"
        aria-label="Sayfalar"
      >
        <button
          @click="prevPage"
          :disabled="store.activePageIndex === 0"
          class="px-2 py-0.5 rounded hover:bg-[var(--chrome-bg-soft)] disabled:opacity-30 disabled:cursor-not-allowed font-mono"
          :title="t('prevPage')"
        >
          ‹
        </button>
        <span class="font-mono w-12 text-center text-[var(--chrome-title)]">
          {{ store.activePageIndex + 1 }} / {{ store.pages.length }}
        </span>
        <button
          @click="nextPage"
          :disabled="store.activePageIndex >= store.pages.length - 1"
          class="px-2 py-0.5 rounded hover:bg-[var(--chrome-bg-soft)] disabled:opacity-30 disabled:cursor-not-allowed font-mono"
          :title="t('nextPage')"
        >
          ›
        </button>
        <span class="w-px h-4 bg-[var(--chrome-border)]"></span>
        <button
          @click="addPage"
          class="px-2 py-0.5 rounded hover:bg-[var(--chrome-bg-soft)] font-mono"
          :title="t('newPage')"
        >
          +
        </button>
        <button
          @click="askDeletePage"
          :disabled="store.pages.length <= 1"
          class="px-2 py-0.5 rounded hover:bg-red-600/40 disabled:opacity-30 disabled:cursor-not-allowed"
          :title="t('delPage')"
        >
          Sil
        </button>
        <button
          @click="toggleScroll"
          class="px-2 py-0.5 rounded hover:bg-[var(--chrome-bg-soft)] font-mono"
          :class="{ 'bg-[var(--chrome-bg-soft)] text-[var(--chrome-title)]': scrollMode }"
          :title="t('scrollViewTitle')"
        >
          {{ t('scrollView') }}
        </button>
        <span class="w-px h-4 bg-[var(--chrome-border)]"></span>
        <button
          @click="zoomOut"
          class="px-2 py-0.5 rounded hover:bg-[var(--chrome-bg-soft)] font-mono"
          :title="t('zoomOut')"
        >
          −
        </button>
        <button
          @click="resetZoom"
          class="font-mono w-12 text-center text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] rounded py-0.5"
          :title="`${store.zoomLabel} (${t('zoomResetTitle')})`"
        >
          {{ store.zoomLabel }}
        </button>
        <button
          @click="zoomIn"
          class="px-2 py-0.5 rounded hover:bg-[var(--chrome-bg-soft)] font-mono"
          :title="t('zoomIn')"
        >
          +
        </button>
      </div>
      <!-- Perf HUD: reaktivite dışı güncellenir (kendisi render tetiklemez) -->
      <div
        v-if="!presenting"
        ref="hud"
        class="absolute bottom-2 right-2 text-[10px] leading-tight text-[var(--chrome-faint)] bg-[var(--chrome-bg)] rounded px-1.5 py-0.5 pointer-events-none font-mono"
      ></div>

      <div
        v-if="store.pages.length > 1 && !presenting"
        class="absolute left-2 top-2 bottom-14 z-10 w-24 overflow-y-auto flex flex-col gap-2 p-1.5 rounded-lg bg-[var(--chrome-bg)] border border-[var(--chrome-border)]"
        role="navigation"
        :aria-label="t('pageStrip')"
      >
        <button
          v-for="(src, i) in thumbs"
          :key="store.pages[i]?.id ?? i"
          @click="goStrip(i)"
          class="shrink-0 rounded border overflow-hidden transition"
          :class="i === store.activePageIndex ? 'border-indigo-500 ring-2 ring-indigo-500/60' : 'border-[var(--chrome-border)] opacity-70 hover:opacity-100'"
          :title="`${t('page')} ${i + 1}`"
        >
          <img :src="src" class="w-full block pointer-events-none" draggable="false" :alt="`${t('page')} ${i + 1}`" />
          <span class="block text-[10px] font-mono text-center text-[var(--chrome-text)] bg-[var(--chrome-bg-soft)]">{{ i + 1 }}</span>
        </button>
      </div>

      <div
        v-if="presenting"
        class="absolute top-3 right-3 z-20 flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--chrome-bg)] border border-[var(--chrome-border)] text-xs text-[var(--chrome-text)] select-none"
        role="toolbar"
        :aria-label="t('presentation')"
      >
        <span class="font-mono px-1">{{ store.activePageIndex + 1 }} / {{ store.pages.length }}</span>
        <button
          @click="togglePresent"
          class="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
          :title="t('exitPresentTitle')"
        >
          {{ t('exitPresent') }}
        </button>
      </div>

      <div
        v-if="store.savedSession && !presenting"
        class="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--chrome-bg)] border border-[var(--chrome-border-strong)] text-xs text-[var(--chrome-title)] select-none"
        role="dialog"
        :aria-label="t('prevSession')"
      >
        <span>
          {{ t('prevSession') }} ({{ store.savedSession.when }}, {{ store.savedSession.pages }}
          {{ t('pagesUnit') }}, {{ store.savedSession.strokes }} {{ t('lines') }})
        </span>
        <button
          @click="restoreSession"
          class="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
        >
          {{ t('restoreSession') }}
        </button>
        <button
          @click="store.dismissSavedSession()"
          class="px-2 py-0.5 rounded hover:bg-[var(--chrome-bg-soft)] text-[var(--chrome-text)]"
        >
          {{ t('startFresh') }}
        </button>
      </div>
    </div>

    <!-- Uygulama-içi onay / ad-sor diyaloğu (native confirm/prompt yerine) -->
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
          <button
            @click="dialogCancel"
            class="px-2 py-1 rounded hover:bg-[var(--chrome-bg-soft)]"
          >
            {{ t('cancel') }}
          </button>
          <button
            @click="dialogOk"
            class="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
          >
            {{ t('ok') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue'
import { drawingPerf, useDrawingStore } from '@/stores/drawing'
import { PAGE_FORMATS, PAPER_THEMES } from '@/config/paper'
import { CUSTOM_SLOT_COUNT } from '@/config/palettes'
import { TOOL_META } from '@/config/tools'
import { LOCALES, TOOL_LABELS, tr as trFn, type UIKey } from '@/config/locale'
import { SLIDERS } from '@/config/ui'
import { PAGE_MIN, PAGE_MAX } from '@/config/engine'
import {
  CALEM_ACCEPT,
  IMAGE_ACCEPT,
  PDF_ACCEPT,
  SETTINGS_ACCEPT,
  pngFileName,
  settingsBackupName,
} from '@/config/files'
import { selectionBBox, coalescedOf } from '@/lib/select'

const baseCanvas = ref<HTMLCanvasElement | null>(null)
const overlayCanvas = ref<HTMLCanvasElement | null>(null)
const hud = ref<HTMLDivElement | null>(null)
const pdfError = ref('')
const showSettings = ref(false)
const showFile = ref(false)
const showLayers = ref(false)
const presenting = ref(false)
// Kaydırmalı mod: sayfalar alt alta statik bloklar, canlı canvas aktif slotta yüzer.
const scrollMode = ref(false)
const scrollBox = ref<HTMLElement | null>(null)
const activeSlot = ref<HTMLElement | null>(null)
const blockEls = new Map<string, HTMLElement>()
const setBlockRef = (el: unknown, id: string) => {
  if (el instanceof HTMLElement) blockEls.set(id, el)
  else blockEls.delete(id)
}
// Menü kapsayıcıları (dışarı-tıkla kapatma için; paneller v-if'li, butonlar ayrı div'de).
const fileMenu = ref<HTMLElement | null>(null)
const settingsBtn = ref<HTMLElement | null>(null)
const settingsPanel = ref<HTMLElement | null>(null)
const layersBtn = ref<HTMLElement | null>(null)
const layersPanel = ref<HTMLElement | null>(null)
const store = useDrawingStore()

// --- Uygulama-içi onay/soru diyaloğu ---
// Native confirm()/prompt() bloklar, stillenemez ve fullscreen'de bastırılabilir;
// bu yüzden yıkıcı op'lar ve adlandırmalar aynı görsel dilde bir modal kullanır.
const dialogOpen = ref(false)
const dialogKind = ref<'confirm' | 'prompt'>('confirm')
const dialogTitle = ref('')
const dialogMessage = ref('')
const dialogText = ref('')
const dialogPanel = ref<HTMLElement | null>(null)
const dialogInput = ref<HTMLInputElement | null>(null)
let dialogResolve: ((v: boolean | string | null) => void) | null = null

const closeDialog = (result: boolean | string | null) => {
  const r = dialogResolve
  dialogResolve = null
  dialogOpen.value = false
  r?.(result)
}
const askConfirm = (title: string, message = ''): Promise<boolean> =>
  new Promise((resolve) => {
    dialogResolve = resolve as (v: boolean | string | null) => void
    dialogKind.value = 'confirm'
    dialogTitle.value = title
    dialogMessage.value = message
    dialogOpen.value = true
    nextTick(() => dialogPanel.value?.querySelector<HTMLElement>('button')?.focus())
  })
const askPrompt = (title: string, def = ''): Promise<string | null> =>
  new Promise((resolve) => {
    dialogResolve = resolve as (v: boolean | string | null) => void
    dialogKind.value = 'prompt'
    dialogTitle.value = title
    dialogMessage.value = ''
    dialogText.value = def
    dialogOpen.value = true
    nextTick(() => {
      dialogInput.value?.focus()
      dialogInput.value?.select()
    })
  })
const dialogOk = () => {
  if (!dialogOpen.value) return
  closeDialog(dialogKind.value === 'prompt' ? dialogText.value : true)
}
const dialogCancel = () => {
  if (!dialogOpen.value) return
  closeDialog(dialogKind.value === 'prompt' ? null : false)
}

// l10n: arayüz dili store.locale'dan beslenir, eksik anahtar Türkçe'ye düşer.
const t = (k: UIKey): string => trFn(store.locale, k)
const locTools = computed(() => TOOL_LABELS[store.locale] ?? TOOL_LABELS.tr)

// Katman listesi üstte-ilk (dizi 0 = en alt).
const layersTopFirst = computed(() => [...store.activePage.layers].reverse())

const activateLayer = (id: string) => {
  store.setActiveLayer(id)
  drawSelectionOverlay()
  updateHud(true)
}

const addLayerBtn = () => {
  store.addLayer()
  drawSelectionOverlay()
  updateHud(true)
}

const askDeleteLayer = async (id: string) => {
  const l = store.activePage.layers.find((x) => x.id === id)
  if (!l) return
  if (store.activePage.layers.length > 1 && l.strokes.length > 0) {
    if (!(await askConfirm(`"${l.name}" silinsin mi?`, `${l.strokes.length} çizgi kaybolur`))) return
  }
  store.deleteLayer(id)
  drawSelectionOverlay()
  updateHud(true)
}

const renameLayer = async (id: string) => {
  const l = store.activePage.layers.find((x) => x.id === id)
  if (!l) return
  const name = await askPrompt('Katman adı', l.name)
  if (name === null) return
  store.renameLayer(id, name)
}

const addPaletteBtn = async () => {
  const name = await askPrompt('Palet adı', `Palet ${store.palettes.length + 1}`)
  if (name === null) return
  store.addPalette(name)
  updateHud(true)
}

const askDeletePalette = async (id: string) => {
  const p = store.palettes.find((x) => x.id === id)
  if (!p || store.palettes.length <= 1) return
  if (!(await askConfirm(`"${p.name}" paleti silinsin mi?`))) return
  store.deletePalette(id)
  updateHud(true)
}

const renamePaletteBtn = async (id: string) => {
  const p = store.palettes.find((x) => x.id === id)
  if (!p) return
  const name = await askPrompt('Palet adı', p.name)
  if (name === null) return
  store.renamePalette(id, name)
}

// Araç düğme metadatası: config/tools (TOOL_META).
// Hepsi gizlenirse kilitlenmemek için tam listeye düşer.
const visibleTools = computed(() => {
  const list = store.toolbarOrder.filter((t) => !store.hiddenTools.includes(t))
  return list.length > 0 ? list : [...store.toolbarOrder]
})
// Her pointermove'da overlay redraw yapma — frame başına en fazla 1 (rAF throttle).
let rafId = 0
let lastHudAt = 0
let lastFrameAt = 0

const fmtPts = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`)

// Doğrudan DOM yazımı — reactive state'e dokunmaz, render döngüsü tetiklemez.
const updateHud = (force = false) => {
  const el = hud.value
  if (!el) return
  const now = performance.now()
  if (!force && now - lastHudAt < 250) return
  lastHudAt = now
  el.textContent =
    `${drawingPerf.emaMs.toFixed(1)}/${drawingPerf.frameMs.toFixed(0)}ms` +
    ` · ${store.drawingCount} çizgi` +
    ` · ${fmtPts(store.activePoints())}+${fmtPts(drawingPerf.totalPoints)}`
}

const scheduleRender = () => {
  if (rafId !== 0) return
  rafId = requestAnimationFrame(() => {
    rafId = 0
    // Duvar-saati frame aralığı: JS + GPU + kompozit + dev vergisi hepsi dahil.
    // JS süresi (emaMs) düşük ama bu yüksekse suç canvas dışında.
    const now = performance.now()
    if (lastFrameAt !== 0) {
      const dt = now - lastFrameAt
      if (dt > 0 && dt < 250) {
        drawingPerf.frameMs = drawingPerf.frameMs === 0 ? dt : drawingPerf.frameMs * 0.9 + dt * 0.1
      }
    }
    lastFrameAt = now
    store.renderActiveStroke()
    updateHud()
  })
}

// Event handler'lar — template'teki @pointer* binding'leri yeterli.
// onMounted'da addEventListener EKLEME (yoksa her olay 2 kez ateşlenir).
// Tek aktif pointer kilidi: avuç ikinci parmağı mevcut çizgiyi gasp edemez.
// İKİ parmak = pinch gesture: yarım çizgi çöpe atılır, zoom/pan başlar.
let activePointerId: number | null = null
const pointers = new Map<number, { x: number; y: number }>()
let gesture: { d0: number; mx0: number; my0: number } | null = null
let gestureConsumed = false

const ptrPos = (e: PointerEvent) => {
  const r = overlayCanvas.value!.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

// --- Seçim jesti (select aracı): sayfa-uzayında marquee/lasso/taşıma ---
// Önizleme + bbox DOĞRUDAN overlay'e çizilir (reactive değil, rAF yok — pointer olayı kadar).
let selActive = false
let selAnchor: { x: number; y: number } | null = null
let selCurrent: { x: number; y: number } | null = null
let selPoly: { x: number; y: number }[] | null = null
let selMoving = false
let selLast: { x: number; y: number } | null = null
let selHistOpen = false

const cancelSelGesture = () => {
  selActive = false
  selMoving = false
  selLast = null
  selAnchor = null
  selCurrent = null
  selPoly = null
  selHistOpen = false
  activePointerId = null
}

const drawSelectionOverlay = () => {
  const c = overlayCanvas.value
  if (!c) return
  const ctx = c.getContext('2d')
  if (!ctx) return
  const dpr = store.dpr || window.devicePixelRatio || 1
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, c.width, c.height)
  const hasMarquee = selAnchor && selCurrent
  const hasPoly = selPoly && selPoly.length > 1
  const hasSel = store.selectionCount > 0
  if (store.currentTool !== 'select' || (!hasMarquee && !hasPoly && !hasSel)) return
  const t = store.getViewTransform()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const sx = (x: number) => x * t.scale + t.ox
  const sy = (y: number) => y * t.scale + t.oy
  ctx.save()
  ctx.setLineDash([6, 4])
  ctx.lineWidth = 1.2
  if (hasMarquee && selAnchor && selCurrent) {
    const x0 = sx(Math.min(selAnchor.x, selCurrent.x))
    const y0 = sy(Math.min(selAnchor.y, selCurrent.y))
    const x1 = sx(Math.max(selAnchor.x, selCurrent.x))
    const y1 = sy(Math.max(selAnchor.y, selCurrent.y))
    ctx.strokeStyle = '#818cf8'
    ctx.fillStyle = 'rgba(99,102,241,0.08)'
    ctx.beginPath()
    ctx.rect(x0, y0, x1 - x0, y1 - y0)
    ctx.fill()
    ctx.stroke()
  }
  if (hasPoly && selPoly) {
    ctx.strokeStyle = '#818cf8'
    ctx.beginPath()
    selPoly.forEach((p, i) => {
      if (i === 0) ctx.moveTo(sx(p.x), sy(p.y))
      else ctx.lineTo(sx(p.x), sy(p.y))
    })
    ctx.stroke()
  }
  if (hasSel) {
    const bb = selectionBBox(store.strokes, store.selectedIds)
    if (bb) {
      const x0 = sx(bb.x0)
      const y0 = sy(bb.y0)
      const x1 = sx(bb.x1)
      const y1 = sy(bb.y1)
      ctx.strokeStyle = '#6366f1'
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      ctx.rect(x0, y0, x1 - x0, y1 - y0)
      ctx.stroke()
      // Köşe tutamaçları
      ctx.setLineDash([])
      ctx.fillStyle = '#6366f1'
      for (const [hx, hy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as const) {
        ctx.fillRect(hx - 3, hy - 3, 6, 6)
      }
    }
  }
  ctx.restore()
}

const selInside = (p: { x: number; y: number }): boolean => {
  const bb = selectionBBox(store.strokes, store.selectedIds)
  if (!bb) return false
  return p.x >= bb.x0 && p.x <= bb.x1 && p.y >= bb.y0 && p.y <= bb.y1
}

const selectDown = (e: PointerEvent) => {
  if (store.rejectTouch && e.pointerType === 'touch') return
  try {
    overlayCanvas.value!.setPointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
  activePointerId = e.pointerId
  const p = store.eventToPage(e)
  if (store.selectionCount > 0 && selInside(p)) {
    selMoving = true
    selLast = p
    selActive = true
  } else if (store.selectMode === 'lasso') {
    selPoly = [p]
    selActive = true
  } else {
    selAnchor = p
    selCurrent = p
    selActive = true
  }
  drawSelectionOverlay()
}

const selectMove = (e: PointerEvent) => {
  if (!selActive || e.pointerId !== activePointerId) return
  if (e.buttons === 0 && e.pointerType === 'mouse') return
  for (const ev of coalescedOf(e)) {
    const p = store.eventToPage(ev)
    if (selMoving && selLast) {
      if (!selHistOpen) {
        selHistOpen = true
        store.pushHistory()
      }
      store.moveSelected(p.x - selLast.x, p.y - selLast.y)
      selLast = p
    } else if (selPoly) {
      const last = selPoly[selPoly.length - 1]!
      const dx = p.x - last.x
      const dy = p.y - last.y
      if (dx * dx + dy * dy >= 4) selPoly.push(p)
    } else if (selAnchor) {
      selCurrent = p
    }
  }
  drawSelectionOverlay()
}

const selectUp = (e?: PointerEvent) => {
  if (e && activePointerId !== null && e.pointerId !== activePointerId) return
  if (!selActive) {
    activePointerId = null
    return
  }
  selActive = false
  activePointerId = null
  selHistOpen = false
  if (selMoving) {
    selMoving = false
    selLast = null
  } else if (selPoly) {
    const poly = selPoly
    selPoly = null
    if (poly.length >= 3) store.selectLassoArea(poly)
    else if (poly.length > 0) store.selectRectArea(poly[0]!, poly[0]!)
  } else if (selAnchor && selCurrent) {
    const a = selAnchor
    const b = selCurrent
    selAnchor = null
    selCurrent = null
    store.selectRectArea(a, b)
  }
  drawSelectionOverlay()
  updateHud(true)
}

const selAll = () => {
  store.selectAll()
  drawSelectionOverlay()
  updateHud(true)
}

const selCopy = () => {
  store.copySelected()
  updateHud(true)
}

const selPaste = () => {
  store.pasteClipboard()
  drawSelectionOverlay()
  updateHud(true)
}

const selDelete = () => {
  store.deleteSelected()
  drawSelectionOverlay()
  updateHud(true)
}

const textArea = ref<HTMLTextAreaElement | null>(null)

// --- Metin jesti (text aracı): tıkla-oluştur/düzenle, sürükle-taşı ---
// Düzenleme HTML panelde; canvas sadece konum + taşıma için.
let textDownPos: { x: number; y: number } | null = null
let textDownHit: string | null = null
let textMoving = false
let textMoveId: string | null = null
let textMoveLast: { x: number; y: number } | null = null

const cancelTextGesture = () => {
  textDownPos = null
  textDownHit = null
  textMoving = false
  textMoveId = null
  textMoveLast = null
}

const textDown = (e: PointerEvent) => {
  if (store.rejectTouch && e.pointerType === 'touch') return
  try {
    overlayCanvas.value!.setPointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
  activePointerId = e.pointerId
  const p = store.eventToPage(e)
  const hit = store.textAt(p.x, p.y)
  textDownPos = p
  textDownHit = hit ? hit.id : null
  textMoving = false
  textMoveId = null
  textMoveLast = null
}

const textMove = (e: PointerEvent) => {
  if (e.pointerId !== activePointerId || !textDownPos) return
  if (e.buttons === 0 && e.pointerType === 'mouse') return
  for (const ev of coalescedOf(e)) {
    const p = store.eventToPage(ev)
    if (!textMoving && textDownHit) {
      const dx = p.x - textDownPos.x
      const dy = p.y - textDownPos.y
      if (dx * dx + dy * dy >= 9) {
        textMoving = true
        textMoveId = textDownHit
        textMoveLast = p
        store.pushHistory()
        store.clearActiveText()
      }
    } else if (textMoving && textMoveId && textMoveLast) {
      store.moveText(textMoveId, p.x - textMoveLast.x, p.y - textMoveLast.y)
      textMoveLast = p
    }
  }
}

const textUp = (e?: PointerEvent) => {
  if (e && activePointerId !== null && e.pointerId !== activePointerId) return
  const wasMoving = textMoving
  const hit = textDownHit
  const at = textDownPos
  cancelTextGesture()
  activePointerId = null
  if (wasMoving) {
    updateHud(true)
    return
  }
  if (hit) {
    // Mevcut metne tık: düzenle.
    store.activeTextId = hit
  } else if (at) {
    // Boşa tık: yeni metin + düzenle.
    store.createText(at.x, at.y)
  }
  updateHud(true)
}

const onTextInput = (e: Event) => {
  if (!store.activeTextId) return
  store.updateText(store.activeTextId, (e.target as HTMLTextAreaElement).value)
}

// Damla: normalde rengi seçer. ✎ ile silahlanmış slot varsa onu düzenler (tek atımlık).
// Boş "+" önce damla diyaloğunu açar; seçim o diyaloğa düşer (iptalde @cancel temizler).
const customPicker = ref<HTMLInputElement | null>(null)
const editingCustom = ref<number | null>(null)
let pickerArmed = false
const onCustomInput = (hex: string) => {
  if (pickerArmed) {
    pickerArmed = false
    store.addCustomColor(hex)
    return
  }
  if (editingCustom.value !== null) {
    const i = editingCustom.value
    editingCustom.value = null
    store.setCustomSlot(i, hex)
    return
  }
  store.setColor(hex)
}
const pickCustom = () => {
  const picker = customPicker.value
  pickerArmed = false
  if (picker && typeof picker.showPicker === 'function') {
    try {
      pickerArmed = true
      picker.showPicker()
      return
    } catch {
      pickerArmed = false
    }
  }
  store.addCustomColor()
}

const onTextSizeInput = (n: number) => {
  if (!store.activeTextId) return
  store.updateTextStyle(store.activeTextId, { size: n })
}

const onTextColorInput = (hex: string) => {
  if (!store.activeTextId) return
  store.updateTextStyle(store.activeTextId, { color: hex })
}

// Sekme odağını modal içinde tut (arkadaki toolbar'a kaçmasın).
const trapIn = (panel: HTMLElement | null, e: KeyboardEvent) => {
  if (!panel) return
  const nodes = [
    ...panel.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((n) => !n.hasAttribute('disabled') && n.offsetParent !== null)
  if (nodes.length === 0) return
  const first = nodes[0]!
  const last = nodes[nodes.length - 1]!
  const active = document.activeElement as HTMLElement | null
  if (e.shiftKey && (active === first || !panel.contains(active))) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}
const trapFocus = (e: KeyboardEvent) => trapIn(settingsPanel.value, e)
const trapDialogFocus = (e: KeyboardEvent) => trapIn(dialogPanel.value, e)

const closeTextEditor = () => {
  const t = store.activeText()
  // Boş bırakılan kutu çöp olmasın.
  if (t && !t.text) store.deleteText(t.id)
  else store.clearActiveText()
}

const delActiveText = () => {
  const t = store.activeText()
  if (t) store.deleteText(t.id)
  updateHud(true)
}

// --- Resim jesti (image aracı): boşa tıkla-ekle, resme tıkla-seç, sürükle-taşı ---
const imgInput = ref<HTMLInputElement | null>(null)
let imgPending: { x: number; y: number } | null = null
let imgDownPos: { x: number; y: number } | null = null
let imgDownHit: string | null = null
let imgMoving = false
let imgMoveId: string | null = null
let imgMoveLast: { x: number; y: number } | null = null

const cancelImageGesture = () => {
  imgDownPos = null
  imgDownHit = null
  imgMoving = false
  imgMoveId = null
  imgMoveLast = null
}

const imageDown = (e: PointerEvent) => {
  if (store.rejectTouch && e.pointerType === 'touch') return
  try {
    overlayCanvas.value!.setPointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
  activePointerId = e.pointerId
  const p = store.eventToPage(e)
  const hit = store.imageAt(p.x, p.y)
  imgDownPos = p
  imgDownHit = hit ? hit.id : null
  imgMoving = false
  imgMoveId = null
  imgMoveLast = null
  if (hit) store.activeImageId = hit.id
}

const imageMove = (e: PointerEvent) => {
  if (e.pointerId !== activePointerId || !imgDownPos) return
  if (e.buttons === 0 && e.pointerType === 'mouse') return
  for (const ev of coalescedOf(e)) {
    const p = store.eventToPage(ev)
    if (!imgMoving && imgDownHit) {
      const dx = p.x - imgDownPos.x
      const dy = p.y - imgDownPos.y
      if (dx * dx + dy * dy >= 9) {
        imgMoving = true
        imgMoveId = imgDownHit
        imgMoveLast = p
        store.pushHistory()
      }
    } else if (imgMoving && imgMoveId && imgMoveLast) {
      store.moveImage(imgMoveId, p.x - imgMoveLast.x, p.y - imgMoveLast.y)
      imgMoveLast = p
    }
  }
}

const imageUp = (e?: PointerEvent) => {
  if (e && activePointerId !== null && e.pointerId !== activePointerId) return
  const wasMoving = imgMoving
  const hit = imgDownHit
  const at = imgDownPos
  cancelImageGesture()
  activePointerId = null
  if (wasMoving) {
    updateHud(true)
    return
  }
  if (!hit && at) {
    // Boşa tık: dosya seç → tıklanan noktaya yerleştir.
    imgPending = at
    imgInput.value?.click()
  }
  updateHud(true)
}

const onImageFile = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  const at = imgPending
  imgPending = null
  if (!f || !at) return
  const res = await store.addImage(f, at.x, at.y)
  if ('error' in res) showPdfError(res.error)
  updateHud(true)
}

const onImgWidth = (n: number) => {
  const it = store.activeImage()
  if (!it || it.w === 0) return
  store.resizeImage(it.id, n, Math.round((n * it.h) / it.w))
}

const delActiveImage = () => {
  if (store.activeImageId) store.deleteImage(store.activeImageId)
  updateHud(true)
}

// --- El/Space kaydırma: ekran-px delta ile pan (her araçta Space ile) ---
let spacePan = false
let panActive = false
let panLast: { x: number; y: number } | null = null

const panDown = (e: PointerEvent) => {
  try {
    overlayCanvas.value!.setPointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
  activePointerId = e.pointerId
  panLast = ptrPos(e)
  panActive = true
}

const panMove = (e: PointerEvent) => {
  // Space sonradan basılırsa devralınmaz (mürekkep gasp edilmesin) — önce Space, sonra bas.
  if (!panActive || e.pointerId !== activePointerId) return
  if (e.buttons === 0 && e.pointerType === 'mouse') return
  const cur = ptrPos(e)
  if (!panLast) {
    panLast = cur
    return
  }
  store.panBy(cur.x - panLast.x, cur.y - panLast.y)
  panLast = cur
  drawSelectionOverlay()
  updateHud()
}

const panUp = (e?: PointerEvent) => {
  if (e && activePointerId !== null && e.pointerId !== activePointerId) return
  panActive = false
  panLast = null
  activePointerId = null
  updateHud(true)
}

const cancelPan = () => {
  panActive = false
  panLast = null
}

const startDraw = (e: PointerEvent) => {
  if (!overlayCanvas.value) return
  // Avuç reddi pinch'ten ÖNCE: parmak (touchPan kapalıyken) hiç işleme girmez; yoksa
  // dinlenen avuç ikinci pointer olup aktif kalem çizgisini iptal ediyordu.
  if (e.pointerType === 'touch' && store.rejectTouch && !store.touchPan) return
  pointers.set(e.pointerId, ptrPos(e))
  if (pointers.size === 2) {
    store.cancelActiveStroke()
    cancelSelGesture()
    cancelTextGesture()
    cancelImageGesture()
    cancelPan()
    if (rafId !== 0) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    activePointerId = null
    const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }]
    gesture = { d0: Math.hypot(a.x - b.x, a.y - b.y), mx0: (a.x + b.x) / 2, my0: (a.y + b.y) / 2 }
    gestureConsumed = true
    return
  }
  if (pointers.size !== 1 || gesture || gestureConsumed) return
  // Dokun-kaydır açıksa parmak her araçta kaydırır (kalem/fare etkilenmez).
  if (e.pointerType === 'touch' && store.touchPan) {
    panDown(e)
    return
  }
  // Space-kaydırma her aracı ezer (pinch sonrası değil); el aracı dokunmayla da kaydırır.
  if (spacePan || store.currentTool === 'hand') {
    panDown(e)
    return
  }
  if (store.currentTool === 'select') {
    selectDown(e)
    return
  }
  if (store.currentTool === 'text') {
    textDown(e)
    return
  }
  if (store.currentTool === 'image') {
    imageDown(e)
    return
  }
  // pointer capture ile canvas dışına taşınca bile çizmeye devam et
  try {
    overlayCanvas.value.setPointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
  const started = store.startDrawing(e)
  if (!started) return
  activePointerId = e.pointerId
  scheduleRender()
}

const draw = (e: PointerEvent) => {
  const tracked = pointers.get(e.pointerId)
  if (tracked && overlayCanvas.value) {
    const r = overlayCanvas.value.getBoundingClientRect()
    tracked.x = e.clientX - r.left
    tracked.y = e.clientY - r.top
  }
  if (gesture && pointers.size >= 2) {
    const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }]
    const d1 = Math.hypot(a.x - b.x, a.y - b.y)
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    if (gesture.d0 > 0) store.pinch(d1 / gesture.d0, mx, my, mx - gesture.mx0, my - gesture.my0)
    gesture = { d0: d1, mx0: mx, my0: my }
    updateHud()
    drawSelectionOverlay()
    return
  }
  if (store.currentTool === 'select') {
    selectMove(e)
    return
  }
  if (panActive) {
    panMove(e)
    return
  }
  if (store.currentTool === 'text') {
    textMove(e)
    return
  }
  if (store.currentTool === 'image') {
    imageMove(e)
    return
  }
  if (!store.isDrawing || activePointerId === null || e.pointerId !== activePointerId) return
  // Sadece basılıyken çiz (pointermove hover'da ateşlenir)
  if (e.buttons === 0 && e.pointerType === 'mouse') return
  // coalesced events: birikmiş ara noktaları da işle, çizgi köşelenmesin
  for (const ev of coalescedOf(e)) store.draw(ev)
  scheduleRender()
}

const endDraw = (e?: PointerEvent) => {
  if (e) pointers.delete(e.pointerId)
  if (pointers.size === 0) {
    gesture = null
    gestureConsumed = false
  }
  // Gesture bitene (tüm parmaklar kalkana) kadar çizim kapalı — arta kalan parmak çizmesin.
  if (gesture || gestureConsumed) {
    if (gesture && pointers.size < 2) gesture = null
    return
  }
  if (selActive || store.currentTool === 'select') {
    selectUp(e)
    return
  }
  if (panActive) {
    panUp(e)
    return
  }
  if (textDownPos || store.currentTool === 'text') {
    textUp(e)
    return
  }
  if (imgDownPos || store.currentTool === 'image') {
    imageUp(e)
    return
  }
  if (!store.isDrawing) {
    activePointerId = null
    return
  }
  if (e && activePointerId !== null && e.pointerId !== activePointerId) return
  activePointerId = null
  if (rafId !== 0) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
  // stopDrawing stroke'u base'e işler + overlay'i temizler — ek redraw gerekmez.
  store.stopDrawing()
  updateHud(true)
}

const undo = () => {
  store.undoLastStroke()
  drawSelectionOverlay()
  updateHud(true)
}

const redo = () => {
  store.redo()
  drawSelectionOverlay()
  updateHud(true)
}

// Input'ta yazarken tetiklenmez; çizim sırasında el klavyedeyse çalışır.
const onKeyDown = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
  const mod = e.ctrlKey || e.metaKey
  // Sunumda Esc her şeyden önce çıkar (editör dalları sunumda gizlidir).
  if (!mod && !e.altKey && e.key === 'Escape' && presenting.value) {
    void togglePresent()
    return
  }
  // Açık menü varsa Esc önce onu kapatır (seçim/editör dallarından önce).
  if (!mod && !e.altKey && e.key === 'Escape') {
    if (closeMenus()) return
  }
  // Uygulama-içi diyalog açıksa Esc iptal eder.
  if (!mod && !e.altKey && e.key === 'Escape' && dialogOpen.value) {
    dialogCancel()
    return
  }
  // Sunumda klavyeyle sayfa ilerlet/geri (uzaktan kumanda/klavye ile sunum).
  if (presenting.value && !mod && !e.altKey) {
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) {
      e.preventDefault()
      nextPage()
      return
    }
    if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) {
      e.preventDefault()
      prevPage()
      return
    }
  }
  // Açık bir diyalog/panel varken araç kısayolları arkada tetiklenmesin (scrim altında state değişmesin).
  if (showFile.value || showSettings.value || showLayers.value || dialogOpen.value) return
  // Sayfa gezinme: PageDown/PageUp her araçta çalışır.
  if (!mod && !e.altKey && (e.key === 'PageDown' || e.key === 'PageUp')) {
    e.preventDefault()
    if (e.key === 'PageDown') nextPage()
    else prevPage()
    return
  }
  // Space basılı kaydırma (önce Space, sonra sürükle). Tekrarlanan keydown yoksayılır.
  if (!mod && !e.altKey && e.key === ' ' && !e.repeat) {
    if (t && t.tagName === 'BUTTON') return
    e.preventDefault()
    spacePan = true
    return
  }
  // Seçim aracı kısayolları (modsuz): sil / kaç / oklarla dürt.
  if (!mod && !e.altKey && store.currentTool === 'select') {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      store.deleteSelected()
      drawSelectionOverlay()
      updateHud(true)
      return
    }
    if (e.key === 'Escape') {
      if (selActive) cancelSelGesture()
      else store.clearSelection()
      drawSelectionOverlay()
      return
    }
    if (e.key.startsWith('Arrow')) {
      e.preventDefault()
      const step = e.shiftKey ? 10 : 2
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
      if (dx || dy) {
        // Aynı ok grubu tek undo: basılı tutunca onlarca kayıt açmasın.
        store.pushHistoryKeyed('nudge')
        store.moveSelected(dx, dy)
        drawSelectionOverlay()
        updateHud(true)
      }
      return
    }
  }
  // Metin aracı kısayolları (modsuz): sil / kapat.
  if (!mod && !e.altKey && store.currentTool === 'text') {
    if ((e.key === 'Delete' || e.key === 'Backspace') && store.activeTextId) {
      e.preventDefault()
      store.deleteText(store.activeTextId)
      updateHud(true)
      return
    }
    if (e.key === 'Escape' && store.activeTextId) {
      closeTextEditor()
      return
    }
  }
  // Resim aracı kısayolları (modsuz): sil / kapat.
  if (!mod && !e.altKey && store.currentTool === 'image') {
    if ((e.key === 'Delete' || e.key === 'Backspace') && store.activeImageId) {
      e.preventDefault()
      store.deleteImage(store.activeImageId)
      updateHud(true)
      return
    }
    if (e.key === 'Escape') {
      cancelImageGesture()
      store.activeImageId = null
      return
    }
  }
  // Araç kısayolları (modsuz): V seç, P kalem, H vurgu, E silgi, L/R/O/A şekiller, T metin, G resim, F sunum, D çoğalt.
  if (!mod && !e.altKey) {
    const k = e.key.toLowerCase()
    if (k === 'v') {
      store.setTool('select')
      return
    }
    if (k === 'p') {
      store.setTool('pen')
      return
    }
    if (k === 'h') {
      store.setTool('highlighter')
      return
    }
    if (k === 'e') {
      store.setTool('eraser')
      return
    }
    if (k === 'l') {
      store.setTool('line')
      return
    }
    if (k === 'r') {
      store.setTool('rect')
      return
    }
    if (k === 'o') {
      store.setTool('ellipse')
      return
    }
    if (k === 'a') {
      store.setTool('arrow')
      return
    }
    if (k === 't') {
      store.setTool('text')
      return
    }
    if (k === 'g') {
      store.setTool('image')
      return
    }
    if (k === 'd') {
      showFile.value = false
      store.duplicatePage()
      updateHud(true)
      return
    }
    if (k === 'f') {
      void togglePresent()
      return
    }
  }
  if (!mod || e.altKey) return
  const key = e.key.toLowerCase()
  if (key === 'z' && !e.shiftKey) {
    e.preventDefault()
    store.undoLastStroke()
    drawSelectionOverlay()
    updateHud(true)
  } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
    e.preventDefault()
    store.redo()
    drawSelectionOverlay()
    updateHud(true)
  } else if (key === 'a' && store.currentTool === 'select') {
    e.preventDefault()
    store.selectAll()
    drawSelectionOverlay()
    updateHud(true)
  } else if (key === 'c' && store.currentTool === 'select') {
    e.preventDefault()
    store.copySelected()
    updateHud(true)
  } else if (key === 'x' && store.currentTool === 'select') {
    e.preventDefault()
    store.cutSelected()
    drawSelectionOverlay()
    updateHud(true)
  } else if (key === 'v') {
    // Panoda içerik varsa seçime geçip yapıştır.
    if (store.clipboardCount === 0) return
    e.preventDefault()
    if (store.currentTool !== 'select') store.setTool('select')
    store.pasteClipboard()
    drawSelectionOverlay()
    updateHud(true)
  }
}

const onKeyUp = (e: KeyboardEvent) => {
  if (e.key === ' ') spacePan = false
  // Ok bırakılınca dürtme grubunu kapat — sonraki dürtme ayrı undo olsun.
  if (e.key.startsWith('Arrow')) store.endHistoryGroup()
}

const exportPng = () => {
  showFile.value = false
  const url = store.exportDataURL()
  if (!url) return
  const a = document.createElement('a')
  a.href = url
  a.download = pngFileName()
  a.click()
}

const showPdfError = (msg: string) => {
  pdfError.value = msg
  window.setTimeout(() => {
    if (pdfError.value === msg) pdfError.value = ''
  }, 4000)
}

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
  if (!ok) showPdfError('Ayar dosyası geçersiz')
}

const onPdfFile = async (e: Event) => {
  showFile.value = false
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  const hasInk = store.hasInk
  if (hasInk && !(await askConfirm('Mevcut çizimler PDF sayfalarıyla değişecek. Devam?'))) return
  const res = await store.importPdf(f)
  if ('error' in res) showPdfError(res.error)
  updateHud(true)
}

const exportPdfDoc = async () => {
  showFile.value = false
  const res = await store.exportPdf()
  // cancelled = kullanıcı picker'da vazgeçti → hata değil, sessizlik
  if ('error' in res) showPdfError(res.error)
}

const exportCalemDoc = async () => {
  showFile.value = false
  const res = await store.exportCalem()
  if ('error' in res) showPdfError(res.error)
}

const onCalemFile = async (e: Event) => {
  showFile.value = false
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  if (store.hasInk && !(await askConfirm('Mevcut içerik .calem dosyasıyla değişecek. Devam?'))) return
  const res = await store.importCalem(f)
  if ('error' in res) showPdfError(res.error)
  updateHud(true)
  refreshThumbs()
}

const askClosePdf = async () => {
  showFile.value = false
  const hasInk = store.hasInk
  if (hasInk && !(await askConfirm('PDF kapatılıp tek boş sayfaya dönülsün mü?'))) return
  store.closePdf()
  updateHud(true)
}

// Açık menü varsa dışarı-tıklamada kapat (çizim akışını kesmez, sadece gizler).
const closeMenus = (): boolean => {
  let closed = false
  if (showFile.value) {
    showFile.value = false
    closed = true
  }
  if (showSettings.value) {
    showSettings.value = false
    closed = true
  }
  if (showLayers.value) {
    showLayers.value = false
    closed = true
  }
  return closed
}

const onDocPointerDown = (e: PointerEvent) => {
  const t = e.target as Node | null
  if (!t || !(t instanceof Node)) return
  const inside = (el: HTMLElement | null) => !!el && el.contains(t)
  if (showFile.value && !inside(fileMenu.value)) showFile.value = false
  if (showSettings.value && !inside(settingsBtn.value) && !inside(settingsPanel.value)) {
    showSettings.value = false
  }
  if (showLayers.value && !inside(layersBtn.value) && !inside(layersPanel.value)) {
    showLayers.value = false
  }
}

// Temizle yıkıcı bir op: diğer silmelerle aynı korumayı uygula.
const askClearCanvas = async () => {
  if (store.hasInk && !(await askConfirm(`Sayfa ${store.activePageIndex + 1} temizlensin mi?`))) return
  clearCanvas()
}

const clearCanvas = () => {
  activePointerId = null
  store.clearCanvas()
  updateHud(true)
}

// Sunum modu: fullscreen + sade chrome (header/şerit/panel/HUD gizli, pager durur).
// Fullscreen desteklenmiyorsa sade-görünüm fallback'i (Esc yine çıkarır).
const togglePresent = async () => {
  if (!presenting.value) {
    showFile.value = false
    showSettings.value = false
    showLayers.value = false
    presenting.value = true
    try {
      await document.documentElement.requestFullscreen()
    } catch {
      /* sade mod yeter */
    }
  } else {
    presenting.value = false
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
    } catch {
      /* zaten çıkılmış */
    }
  }
  await nextTick()
  sizeCanvas()
  updateHud(true)
}

// Tarayıcı-Esc ile fullscreen'den çıkılınca sade mod da kapanır.
const onFullscreenChange = () => {
  if (!document.fullscreenElement && presenting.value) {
    presenting.value = false
    nextTick(() => {
      sizeCanvas()
      updateHud(true)
    })
  }
}

// Trackpad/mause tekeri: yalın = pan, ctrl/cmd = imleç sabitli zoom.
// passive:false ŞART (sayfa-zoom'u engellemek için preventDefault).
// Kaydırmalı modda yalın tekerlek native kayar (dokunulmaz), ctrl/cmd zoom'lar.
const onWheel = (e: WheelEvent) => {
  if (scrollMode.value && !e.ctrlKey && !e.metaKey) return
  e.preventDefault()
  if (!overlayCanvas.value) return
  const r = overlayCanvas.value.getBoundingClientRect()
  const cx = e.clientX - r.left
  const cy = e.clientY - r.top
  if (e.ctrlKey || e.metaKey) {
    const unit = e.deltaMode === 1 ? 16 : 1
    store.zoomBy(Math.exp(-e.deltaY * unit * 0.002), cx, cy)
  } else {
    store.panBy(-e.deltaX, -e.deltaY)
  }
  drawSelectionOverlay()
  updateHud(true)
}

const zoomIn = () => {
  store.zoomStep(1.25)
  drawSelectionOverlay()
  updateHud(true)
}

const zoomOut = () => {
  store.zoomStep(1 / 1.25)
  drawSelectionOverlay()
  updateHud(true)
}

const resetZoom = () => {
  store.resetView()
  drawSelectionOverlay()
  updateHud(true)
}

const prevPage = () => {
  store.goToPage(store.activePageIndex - 1)
  updateHud(true)
}

const nextPage = () => {
  store.goToPage(store.activePageIndex + 1)
  updateHud(true)
}

const addPage = () => {
  store.addPage()
  updateHud(true)
}

const askDeletePage = async () => {
  if (store.pages.length <= 1) return
  const msg = `Sayfa ${store.activePageIndex + 1} silinsin mi?`
  if (!(await askConfirm(msg, `${store.drawingCount} çizgi kaybolur`))) return
  activePointerId = null
  store.deletePage(store.activePageIndex)
  updateHud(true)
}

const dupPage = () => {
  showFile.value = false
  store.duplicatePage()
  updateHud(true)
}

const movePageL = () => {
  store.movePageActive(-1)
  updateHud(true)
}

const movePageR = () => {
  store.movePageActive(1)
  updateHud(true)
}

const restoreSession = async () => {
  if (store.hasInk && !(await askConfirm('Mevcut çalışma önceki oturumla değişecek. Devam?'))) return
  const ok = await store.loadPersisted()
  if (!ok) showPdfError('Oturum yüklenemedi')
  updateHud(true)
  refreshThumbs()
}

const sizeCanvas = () => {
  if (!baseCanvas.value || !overlayCanvas.value) return
  if (scrollMode.value) positionSlot()
  store.resizeCanvas()
  drawSelectionOverlay()
}

// Aktif slotu aktif bloğun üstüne oturtur (ölçüler bloktan, eşleşme birebir).
const positionSlot = () => {
  if (!scrollMode.value || !scrollBox.value || !activeSlot.value) return
  const slot = activeSlot.value
  const pg = store.pages[store.activePageIndex]
  const block = pg ? blockEls.get(pg.id) : undefined
  if (!block || block.offsetWidth === 0) {
    slot.style.display = 'none'
    return
  }
  slot.style.display = ''
  slot.style.top = `${block.offsetTop}px`
  slot.style.left = `${block.offsetLeft}px`
  slot.style.width = `${block.offsetWidth}px`
  slot.style.height = `${block.offsetHeight}px`
}

const scrollActiveIntoView = () => {
  if (!scrollMode.value) return
  const pg = store.pages[store.activePageIndex]
  const block = pg ? blockEls.get(pg.id) : undefined
  block?.scrollIntoView({ block: 'nearest' })
}

// Pasif sayfaların statik resmi (aktif sayfa canlı canvas'la gelir, atlanır).
let blockTimer: ReturnType<typeof setTimeout> | undefined
let stopBlockWatch: (() => void) | null = null
const refreshBlocks = () => {
  if (!scrollMode.value) return
  if (blockTimer) clearTimeout(blockTimer)
  blockTimer = setTimeout(() => {
    blockTimer = undefined
    try {
      const activeId = store.pages[store.activePageIndex]?.id
      for (const p of store.pages) {
        if (p.id === activeId) continue
        const el = blockEls.get(p.id)
        if (!el) continue
        const c = store.exportPageToCanvas(p, p.size.w > 0 ? 860 / p.size.w : 0.5)
        if (!c) continue
        c.className = 'block w-full h-auto'
        el.replaceChildren(c)
      }
    } catch {
      /* boş blok */
    }
  }, 350)
}

const toggleScroll = async () => {
  cancelSelGesture()
  cancelTextGesture()
  cancelImageGesture()
  cancelPan()
  activePointerId = null
  pointers.clear()
  scrollMode.value = !scrollMode.value
  await nextTick()
  bindCanvases()
  if (scrollMode.value) {
    refreshBlocks()
    positionSlot()
    scrollActiveIntoView()
  }
  store.resizeCanvas()
  drawSelectionOverlay()
  updateHud(true)
}

// Seçim değişince bbox'ı tazele (taşıma nokta-mutasyonu, id aynı — orası explicit redraw).
let stopSelWatch: (() => void) | null = null
let stopTextWatch: (() => void) | null = null
let stopPageWatch: (() => void) | null = null
let stopSettingsWatch: (() => void) | null = null
let stopChromeWatch: (() => void) | null = null

// Sayfa şeridi: düşük çözünürlüklü önbellek, tick+sayfa-değişiminde debounce'lu tazelenir.
const thumbs = ref<string[]>([])
let thumbTimer: ReturnType<typeof setTimeout> | undefined
let stopThumbWatch: (() => void) | null = null
const refreshThumbs = () => {
  if (thumbTimer) clearTimeout(thumbTimer)
  thumbTimer = setTimeout(() => {
    thumbTimer = undefined
    try {
      thumbs.value = store.pages.map((p) => {
        const c = store.exportPageToCanvas(p, p.size.w > 0 ? 96 / p.size.w : 0.15)
        return c ? c.toDataURL() : ''
      })
    } catch {
      /* boş şerit */
    }
  }, 350)
}

const goStrip = (i: number) => {
  store.goToPage(i)
  updateHud(true)
}

// Canvas initialization
// Canvas'lar mod değişiminde remount olur → ref'leri + wheel'i yeniden bağlar.
const bindCanvases = () => {
  if (!baseCanvas.value || !overlayCanvas.value) return false
  overlayCanvas.value.style.touchAction = 'none'
  store.setCanvasRef(baseCanvas.value)
  store.setOverlayRef(overlayCanvas.value)
  overlayCanvas.value.addEventListener('wheel', onWheel, { passive: false })
  return true
}

onMounted(() => {
  bindCanvases()
  // Önce ayarlar (kâğıt rengi), sonra ilk boya — yanlış renk flaşı yok.
  // Otomatik oturum yükleme YOK: kayıt varsa banner çıkar, seçim kullanıcıda.
  store
    .loadSettings()
    .then(() => {
      store.setupCanvas()
      return store.checkSavedSession()
    })
    .then(() => {
      updateHud(true)
      refreshThumbs()
    })
  updateHud(true)

  window.addEventListener('resize', sizeCanvas)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('pointerdown', onDocPointerDown)
  stopSelWatch = watch(
    () => store.selectedIds,
    () => drawSelectionOverlay(),
  )
  // HUD + seçim overlay'i: bir handler updateHud/drawSelectionOverlay çağırmayı
  // unutsa bile ilgili state değişince tazelenir (bayat sayaç/çerçeve riski biter).
  stopChromeWatch = watch(
    () => [store.drawingCount, store.currentTool, store.selectMode, store.activePageIndex] as const,
    () => {
      drawSelectionOverlay()
      updateHud(true)
    },
  )
  // Diyalog açılınca ilk kontrole odaklan, kapanınca tetikleyiciye dön.
  stopSettingsWatch = watch(showSettings, (open) => {
    if (open) {
      nextTick(() =>
        settingsPanel.value?.querySelector<HTMLElement>('button, input, select, textarea')?.focus(),
      )
    } else {
      settingsBtn.value?.querySelector<HTMLElement>('button')?.focus()
    }
  })
  // Editör açılınca fareyi bekletme — klavye hazır gelsin.
  stopTextWatch = watch(
    () => store.activeTextId,
    (id) => {
      if (id) nextTick(() => textArea.value?.focus())
    },
  )
  stopThumbWatch = watch(() => [store.thumbTick, store.pages] as const, refreshThumbs)
  refreshThumbs()
  stopBlockWatch = watch(() => store.thumbTick, refreshBlocks)
  stopPageWatch = watch(
    () => store.activePageIndex,
    () => {
      if (!scrollMode.value) return
      nextTick(() => {
        positionSlot()
        store.resizeCanvas()
        drawSelectionOverlay()
        refreshBlocks()
        scrollActiveIntoView()
      })
    },
  )
})

onUnmounted(() => {
  if (rafId !== 0) cancelAnimationFrame(rafId)
  activePointerId = null
  cancelSelGesture()
  cancelTextGesture()
  cancelImageGesture()
  cancelPan()
  spacePan = false
  pointers.clear()
  gesture = null
  stopSelWatch?.()
  stopSelWatch = null
  stopTextWatch?.()
  stopTextWatch = null
  stopThumbWatch?.()
  stopThumbWatch = null
  if (thumbTimer) clearTimeout(thumbTimer)
  thumbTimer = undefined
  stopBlockWatch?.()
  stopBlockWatch = null
  stopPageWatch?.()
  stopPageWatch = null
  stopSettingsWatch?.()
  stopSettingsWatch = null
  stopChromeWatch?.()
  stopChromeWatch = null
  if (blockTimer) clearTimeout(blockTimer)
  blockTimer = undefined
  blockEls.clear()
  window.removeEventListener('resize', sizeCanvas)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  document.removeEventListener('pointerdown', onDocPointerDown)
  overlayCanvas.value?.removeEventListener('wheel', onWheel)
  store.setCanvasRef(null)
  store.setOverlayRef(null)
})
</script>

<style scoped>
canvas {
  -webkit-tap-highlight-color: transparent;
  touch-action: none;
  user-select: none;
}
</style>
