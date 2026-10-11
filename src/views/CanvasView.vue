<template>
  <div
    class="h-screen h-dvh flex flex-col bg-[var(--page-bg)] overflow-hidden"
    :style="appHeightPx ? { height: `${appHeightPx}px` } : undefined"
  >
    <header
      v-if="!presenting"
      :class="isMobile
        ? 'relative z-10 flex h-13 w-full shrink-0 items-center justify-between gap-2 border-b border-[var(--chrome-border)] bg-[var(--chrome-bg)] px-3 select-none'
        : 'absolute left-1/2 top-3 z-20 w-max max-w-[calc(100%-1rem)] -translate-x-1/2 select-none'"
    >
      <div :class="isMobile ? 'contents' : 'flex max-w-full items-center gap-1 overflow-x-auto no-scrollbar whitespace-nowrap rounded-2xl border border-[var(--chrome-border-strong)] bg-[var(--float-bg)] px-2 py-1.5 shadow-xl backdrop-blur'">
      <div class="flex items-center gap-1 shrink-0">
        <img
        v-if="isMobile"
        src="/icon-192.png"
        alt="Calem"
        title="Calem"
        class="h-7 w-7 rounded-md select-none"
        draggable="false"
      />
      <div ref="fileMenu" class="relative shrink-0">
        <button
          @click="showFile = !showFile; showLayers = false; showStyle = false; showMore = false"
          class="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--chrome-text)] hover:text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] transition"
          :class="{ 'bg-[var(--chrome-bg-soft)] text-[var(--chrome-title)]': showFile }"
          :title="t('fileOps')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
        </button>
        <FileMenuPanel
          :open="showFile"
          ref="filePanelRef"
          @open-calem="openCalemDoc"
          @save-calem="quickSaveDoc"
          @open-xopp="openXoppDoc"
          @export-xopp="exportXoppDoc"
          @pdf-file="onPdfFile"
          @export-pdf="exportPdfDoc"
          @export-png="exportPng"
          @dup-page="dupPage"
          @move-page-l="movePageL"
          @move-page-r="movePageR"
          @close-pdf="askClosePdf"
        />
        <input
          ref="calemInput"
          type="file"
          :accept="CALEM_ACCEPT"
          class="hidden"
          @change="onCalemFile"
        />
        <input
          ref="xoppInput"
          type="file"
          :accept="XOPP_ACCEPT"
          class="hidden"
          @change="onXoppFile"
        />
      </div>

      <div ref="settingsBtn" class="relative shrink-0">
        <button
          @click="showSettings = !showSettings; showLayers = false; showStyle = false; showMore = false"
          class="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--chrome-text)] hover:text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] transition"
          :class="{ 'bg-[var(--chrome-bg-soft)] text-[var(--chrome-title)]': showSettings }"
          :title="t('settings')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24">
            <path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
            <circle cx="16" cy="8" r="2.2" />
            <circle cx="10" cy="16" r="2.2" />
          </svg>
        </button>
      </div>

      <div ref="layersBtn" class="relative shrink-0">
        <button
          @click="showLayers = !showLayers; showSettings = false; showStyle = false; showMore = false"
          class="relative w-8 h-8 rounded-lg flex items-center justify-center text-[var(--chrome-text)] hover:text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] transition"
          :class="{ 'bg-[var(--chrome-bg-soft)] text-[var(--chrome-title)]': showLayers }"
          :title="t('layersTitle')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3l9 5-9 5-9-5 9-5z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 13l9 5 9-5" />
          </svg>
          <span class="absolute -top-1 -right-1 min-w-4 h-4 px-0.5 rounded-full bg-indigo-600 text-white text-[9px] leading-4 text-center font-mono">{{ store.activePage.layers.length }}</span>
        </button>

        <LayersPanel :open="showLayers" ref="layersPanelRef" @close="showLayers = false" @changed="onLayersChanged" />
      </div>

      <span v-if="store.pdfBusy" class="text-[10px] text-yellow-400/80 font-mono ml-1">{{ t('processing') }}</span>
      <span v-if="pdfError" class="text-[10px] text-red-400 font-mono ml-1">{{ pdfError }}</span>
    </div>

    <span v-if="!isMobile" class="w-px h-5 bg-[var(--chrome-border)] shrink-0"></span>
    <!-- ORTA: Desktop dock -->
      <!-- Araç Dock'u -->
      <div v-if="!isMobile" class="flex shrink-0 items-center gap-0.5" role="toolbar" :aria-label="t('tools')">
        <button
          v-for="tool in (isNarrow && !isMobile ? visibleTools.slice(0, 6) : visibleTools)"
          :key="tool"
          @click="store.setTool(tool)"
          :class="store.currentTool === tool ? (TOOL_META[tool].active + ' shadow-xs') : 'text-[var(--chrome-text)] hover:text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)]'"
          class="w-7 h-7 rounded-md flex items-center justify-center transition-all"
          :title="locTools[tool].title"
          :aria-label="locTools[tool].label"
        >
          <ToolIcon :icon="TOOL_META[tool].icon" />
        </button>
      </div>
      <span v-if="!isMobile" class="w-px h-5 bg-[var(--chrome-border)] shrink-0"></span>
      <div v-if="!isMobile" ref="styleBtn" class="relative shrink-0 min-[1440px]:hidden">
        <button
          @click="showStyle = !showStyle; showFile = false; showLayers = false; showMore = false"
          class="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[var(--chrome-text)] hover:text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] transition"
          :class="{ 'bg-[var(--chrome-bg-soft)] text-[var(--chrome-title)]': showStyle }"
          :title="t('palette')"
        >
          <span
            v-if="store.currentTool !== 'select' && store.currentTool !== 'hand' && store.currentTool !== 'eraser'"
            class="w-4 h-4 rounded-full border border-[var(--chrome-border-strong)]"
            :style="{ background: store.color }"
          ></span>
          <span
            v-if="store.currentTool !== 'select' && store.currentTool !== 'text' && store.currentTool !== 'image' && store.currentTool !== 'hand'"
            class="text-[11px] font-mono"
          >{{ store.strokeWidth }}</span>
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24">
            <path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
            <circle cx="16" cy="8" r="2.2" />
            <circle cx="10" cy="16" r="2.2" />
          </svg>
        </button>
      </div>
      <!-- Geniş ekran satır-içi ayarları (renk + kalınlık + opaklık). Dar ekranda popover'da. -->
      <div v-if="!isMobile" class="hidden min-[1440px]:flex shrink-0 items-center gap-1.5">
        <div
          v-if="store.currentTool !== 'select' && store.currentTool !== 'hand' && store.currentTool !== 'eraser'"
          class="flex items-center gap-1 shrink-0"
          role="toolbar"
          :aria-label="t('palette')"
        >
          <button
            v-for="hex in store.activePalette.colors"
            :key="hex"
            @click="store.setColor(hex)"
            :title="hex"
            class="w-5 h-5 rounded-full border transition block shrink-0"
            :class="store.color.toLowerCase() === hex ? 'border-[var(--chrome-title)] scale-110 ring-2 ring-indigo-500/60' : 'border-[var(--chrome-border-strong)] hover:border-[var(--chrome-title)]'"
            :style="{ background: hex }"
          ></button>
        </div>
        <span
          v-if="store.currentTool !== 'select' && store.currentTool !== 'text' && store.currentTool !== 'image' && store.currentTool !== 'hand'"
          class="flex items-center gap-1.5"
        >
          <span class="text-xs text-[var(--chrome-muted)] whitespace-nowrap">{{ t('width') }}</span>
          <input
            type="range"
            :min="store.widthMin"
            :max="store.widthMax"
            :value="store.strokeWidth"
            @input="store.setStrokeWidth(Number(($event.target as HTMLInputElement).value))"
            class="w-18 accent-indigo-600 cursor-pointer"
          />
          <span class="text-xs text-[var(--chrome-text)] w-5 text-right font-mono">{{ store.strokeWidth }}</span>
          <template v-if="['pen', 'line', 'rect', 'ellipse', 'arrow'].includes(store.currentTool)">
            <select
              :value="store.strokeDash"
              @change="store.setStrokeDash(($event.target as HTMLSelectElement).value)"
              class="px-1.5 py-1 rounded bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border-strong)] text-xs text-[var(--chrome-title)] focus:outline-none"
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
              class="w-14 accent-indigo-600 cursor-pointer"
              :title="t('opacity')"
            />
            <span class="text-xs text-[var(--chrome-text)] w-7 text-right font-mono">{{ Math.round(store.strokeOpacity * 100) }}%</span>
          </template>
          <template v-if="store.currentTool === 'eraser'">
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
        </span>
      </div>
      <span v-if="!isMobile" class="w-px h-5 bg-[var(--chrome-border)] shrink-0"></span>
      <div v-if="!isMobile" class="flex shrink-0 items-center gap-0.5">
        <button
          @click="undo"
          :disabled="store.undoStack.length === 0"
          class="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--chrome-text)] hover:text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] transition disabled:opacity-30 disabled:cursor-not-allowed"
          :title="t('undoTitle')"
          aria-label="Geri al"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a5 5 0 015 5v2M3 10l5-5M3 10l5 5" />
          </svg>
        </button>
        <button
          @click="redo"
          :disabled="store.redoStack.length === 0"
          class="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--chrome-text)] hover:text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] transition disabled:opacity-30 disabled:cursor-not-allowed"
          :title="t('redoTitle')"
          aria-label="Yinele"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 10H11a5 5 0 00-5 5v2M21 10l-5-5M21 10l-5 5" />
          </svg>
        </button>
        <button
          @click="askClearCanvas"
          class="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-500/10 transition"
          :title="t('clearTitle')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.832A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.832L3 7m5 0V4a1 1 0 011-1h6a1 1 0 011 1v3M9 11v6m6-6v6" />
          </svg>
        </button>
        <button
          @click="togglePresent"
          class="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--chrome-text)] hover:text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] transition"
          :title="t('presentTitle')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="2" y="3" width="20" height="14" rx="2" stroke-width="2" stroke="currentColor" fill="none" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 21h8m-4-4v4" />
          </svg>
        </button>
      </div>
      <div v-if="!isMobile && isNarrow && visibleTools.length > 6" ref="moreBtn" class="relative shrink-0">
        <button
          @click="showMore = !showMore; showFile = false; showLayers = false; showStyle = false"
          class="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--chrome-text)] hover:text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] transition"
          :class="{ 'bg-[var(--chrome-bg-soft)] text-[var(--chrome-title)]': showMore }"
          :title="t('moreTitle')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      <StylePanel :open="showStyle" ref="stylePanelRef" @close="showStyle = false" @changed="onStyleChanged" />

      <!-- Taşma menüsü (dar masaüstü): bara sığmayan son araçlar -->
      <Teleport to="body">
      <div
        ref="morePanel"
        v-if="showMore"
        class="fixed left-1/2 top-[68px] z-30 w-56 max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-90px)] overflow-y-auto -translate-x-1/2 rounded-2xl border border-[var(--chrome-border-strong)] bg-[var(--float-bg)] p-1.5 text-xs shadow-xl backdrop-blur"
        role="menu"
        :aria-label="t('moreTitle')"
      >
        <button
          v-for="tool in visibleTools.slice(6)"
          :key="tool"
          @click="store.setTool(tool); showMore = false"
          class="flex w-full items-center gap-2 px-3 py-1.5 rounded text-left transition"
          :class="store.currentTool === tool ? 'bg-indigo-600 text-white' : 'text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)]'"
          :title="locTools[tool].title"
        >
          <span class="font-medium">{{ locTools[tool].label }}</span>
        </button>
      </div>
      </Teleport>

    <!-- SAĞ (yalnızca mobil üst şerit): Temizle / Sunum -->
    <div v-if="isMobile" class="flex items-center gap-1 shrink-0 ml-auto">

      <!-- Temizle (Clear Canvas) -->
      <button
        @click="askClearCanvas"
        class="h-8 px-2.5 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition flex items-center gap-1.5"
        :title="t('clearTitle')"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.832A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.832L3 7m5 0V4a1 1 0 011-1h6a1 1 0 011 1v3M9 11v6m6-6v6" />
        </svg>
      </button>

      <!-- Sunum (Present) -->
      <button
        @click="togglePresent"
        class="h-8 px-2.5 rounded-lg text-xs font-medium text-[var(--chrome-text)] hover:text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] transition flex items-center gap-1.5"
        :title="t('presentTitle')"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="2" y="3" width="20" height="14" rx="2" stroke-width="2" stroke="currentColor" fill="none" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 21h8m-4-4v4" />
        </svg>
      </button>
    </div>
      </div>
  </header>

      <SettingsPanel :open="showSettings" ref="settingsPanelRef" @close="showSettings = false" @page-layout="onPageLayoutChange" @error="showPdfError" />


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
          @pointerdown.prevent="startDraw"
          @pointermove.prevent="draw"
          @pointerup="endDraw"
          @pointerleave="endDraw"
          @pointercancel="cancelDraw"
          @touchstart.prevent
          @touchmove.prevent
          @gesturestart.prevent
          @gesturechange.prevent
          @dblclick.prevent
          @contextmenu.prevent
        ></canvas>
      </template>
      <div v-else ref="scrollBox" class="absolute inset-0 overflow-y-auto" @scroll.passive="onScrollBox">
        <div class="mx-auto w-full max-w-[860px] px-3 pt-3 pb-28 flex flex-col gap-4">
          <div
            v-for="(p, i) in store.pages"
            :key="p.id"
            class="w-full"
          >
          <div
            :ref="(el) => setBlockRef(el, p.id)"
            class="mx-auto rounded-sm overflow-hidden cursor-pointer scroll-mt-2 min-[640px]:scroll-mt-[72px]"
            :style="{ width: `${store.zoomFactor * 100}%`, aspectRatio: `${p.size.w} / ${p.size.h}`, visibility: i === store.activePageIndex ? 'hidden' : 'visible', touchAction: 'pan-x pan-y' }"
            @pointerdown.prevent="onBlockDown"
            @pointerup="onBlockUp($event, i)"
            @pointercancel="resetBlockTap"
          ></div>
          </div>
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
            @pointerdown.prevent="startDraw"
            @pointermove.prevent="draw"
            @pointerup="endDraw"
            @pointerleave="endDraw"
            @pointercancel="cancelDraw"
            @touchstart.prevent
            @touchmove.prevent
            @gesturestart.prevent
            @gesturechange.prevent
            @dblclick.prevent
            @contextmenu.prevent
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

      <!-- Inline metin editörü ve altındaki kayan araç çubuğu -->
      <TextEditorOverlay
        ref="textOverlayRef"
        :presenting="presenting"
        :active-text-screen-rect="activeTextScreenRect"
        :container-style="textEditorContainerStyle"
        @input="onTextInput"
        @size-input="onTextSizeInput"
        @color-input="onTextColorInput"
        @delete="delActiveText"
        @close="closeTextEditor"
      />

      <!-- Resim altında floating şekilde duran kontrol çubuğu -->
      <ImageEditorOverlay
        :presenting="presenting"
        :active-image-screen-rect="activeImageScreenRect"
        :container-style="imageEditorContainerStyle"
        @resize="onImgWidth"
        @delete="delActiveImage"
        @close="store.activeImageId = null"
      />

      <PageNavBar
        :scroll-mode="scrollMode"
        @prev-page="prevPage"
        @next-page="nextPage"
        @add-page="addPage"
        @delete-page="askDeletePage"
        @toggle-scroll="toggleScroll"
        @zoom-in="zoomIn"
        @zoom-out="zoomOut"
        @reset-zoom="resetZoom"
      />
      <!-- Perf HUD: reaktivite dışı güncellenir (kendisi render tetiklemez) -->
      <div
        v-if="!presenting"
        ref="hud"
        class="absolute right-2 text-[10px] leading-tight text-[var(--chrome-faint)] bg-[var(--chrome-bg)] rounded px-1.5 py-0.5 pointer-events-none font-mono"
        :class="isNarrow && !isMobile ? 'top-[68px]' : 'top-2'"
      ></div>

      <div
        v-if="store.pages.length > 1 && !presenting && store.pageStripOpen"
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

    <!-- MOBİL YÜZEN ARAÇ ÇUBUĞU (başparmak bölgesi, <640px) -->
    <div
      v-if="!presenting && isMobile"
      class="relative z-10 shrink-0 mx-2 mb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center gap-1 rounded-2xl border border-[var(--chrome-border-strong)] bg-[var(--float-bg)] px-2 py-1.5 shadow-xl backdrop-blur"
      role="toolbar"
      :aria-label="t('tools')"
    >
      <div class="flex-1 min-w-0 overflow-x-auto no-scrollbar flex items-center gap-1">
        <button
          v-for="tool in visibleTools"
          :key="tool"
          @click="store.setTool(tool)"
          :class="store.currentTool === tool ? (TOOL_META[tool].active + ' shadow-xs') : 'text-[var(--chrome-text)] hover:text-[var(--chrome-title)]'"
          class="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition"
          :title="locTools[tool].title"
          :aria-label="locTools[tool].label"
        >
          <ToolIcon :icon="TOOL_META[tool].icon" />
        </button>
      </div>
      <span class="w-px h-6 bg-[var(--chrome-border)] shrink-0"></span>
      <button
        @click="mobileOptions = true"
        class="shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border)]"
        :title="t('palette')"
      >
        <span
          class="w-4 h-4 rounded-full border border-[var(--chrome-border-strong)]"
          :style="{ background: store.color }"
        ></span>
        <span class="text-[11px] font-mono">{{ store.strokeWidth }}</span>
      </button>
      <button
        @click="undo"
        :disabled="store.undoStack.length === 0"
        class="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-[var(--chrome-text)] hover:text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] disabled:opacity-30 disabled:cursor-not-allowed transition"
        :title="t('undoTitle')"
        aria-label="Geri al"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a5 5 0 015 5v2M3 10l5-5M3 10l5 5" />
        </svg>
      </button>
      <button
        @click="redo"
        :disabled="store.redoStack.length === 0"
        class="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-[var(--chrome-text)] hover:text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] disabled:opacity-30 disabled:cursor-not-allowed transition"
        :title="t('redoTitle')"
        aria-label="Yinele"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 10H11a5 5 0 00-5 5v2M21 10l-5-5M21 10l-5 5" />
        </svg>
      </button>
    </div>

    <!-- MOBİL SEÇENEKLER: renk / kalınlık / çizgi stili (alt sheet) -->
    <MobileOptionsSheet
      :open="mobileOptions"
      @close="mobileOptions = false"
      @select-all="selAll"
      @select-copy="selCopy"
      @select-paste="selPaste"
      @select-delete="selDelete"
      @clear="askClearCanvas"
      @present="togglePresent"
    />

    <!-- Uygulama-içi onay / ad-sor diyaloğu -->
    <AppDialog />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue'
import { drawingPerf } from '@/model/document'
import { useDrawingStore } from '@/stores/drawing'
import { useDialogs } from '@/composables/useDialogs'
import { useLocale } from '@/composables/useLocale'
import { usePointerState } from '@/composables/usePointerState'
import { useSelectionOps } from '@/composables/useSelectionOps'
import { useCanvasShortcuts } from '@/composables/useCanvasShortcuts'
import { useCanvasFileActions } from '@/composables/useCanvasFileActions'
import { useSelectionGesture } from '@/composables/useSelectionGesture'
import { useScrollMode } from '@/composables/useScrollMode'
import { usePanGesture } from '@/composables/usePanGesture'
import { useTextGesture } from '@/composables/useTextGesture'
import { useImageGesture } from '@/composables/useImageGesture'
import AppDialog from '@/components/AppDialog.vue'
import FileMenuPanel from '@/components/FileMenuPanel.vue'
import ImageEditorOverlay from '@/components/ImageEditorOverlay.vue'
import LayersPanel from '@/components/LayersPanel.vue'
import MobileOptionsSheet from '@/components/MobileOptionsSheet.vue'
import PageNavBar from '@/components/PageNavBar.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'
import StylePanel from '@/components/StylePanel.vue'
import TextEditorOverlay from '@/components/TextEditorOverlay.vue'
import ToolIcon from '@/components/ToolIcon.vue'
import { TOOL_META } from '@/config/tools'
import { SLIDERS } from '@/config/ui'
import { CALEM_ACCEPT, IMAGE_ACCEPT, PDF_ACCEPT, XOPP_ACCEPT, pngFileName } from '@/config/files'
import { coalescedOf } from '@/lib/select'
import { takeLaunchHandle, onLaunchHandle, type LaunchHandle } from '@/lib/launchFile'

const baseCanvas = ref<HTMLCanvasElement | null>(null)
const overlayCanvas = ref<HTMLCanvasElement | null>(null)
const hud = ref<HTMLDivElement | null>(null)
const showSettings = ref(false)
const showFile = ref(false)
const showLayers = ref(false)
const showStyle = ref(false)
const showMore = ref(false)
const presenting = ref(false)
// Mobil layout (< 900px): araclar alta iner, header sadeleşir. matchMedia ile izlenir.
const isMobile = ref(false)
const mobileOptions = ref(false)
// Dar masaüstü (640-899px): dock kuyruğu "v" taşma menüsüne girer.
const isNarrow = ref(false)
let mobileMq: MediaQueryList | null = null
let narrowMq: MediaQueryList | null = null
const syncIsMobile = () => {
  isMobile.value = !!mobileMq?.matches
  isNarrow.value = !!narrowMq?.matches
  if (!isMobile.value) mobileOptions.value = false
}
// Görünüm (pan / zoom / sürükleme) değiştikçe ekran koordinatlarını tetikleyen sayaç
const viewTransformTick = ref(0)

// Menü kapsayıcıları (dışarı-tıkla kapatma için; paneller v-if'li, butonlar ayrı div'de).
const fileMenu = ref<HTMLElement | null>(null)
const settingsBtn = ref<HTMLElement | null>(null)
const settingsPanelRef = ref<InstanceType<typeof SettingsPanel> | null>(null)
const layersBtn = ref<HTMLElement | null>(null)
const layersPanelRef = ref<InstanceType<typeof LayersPanel> | null>(null)
// Katman paneli değişikliğinde seçim overlay + HUD tazele (panel 'changed' yayını).
const onLayersChanged = () => {
  drawSelectionOverlay()
  updateHud(true)
}
const styleBtn = ref<HTMLElement | null>(null)
const stylePanelRef = ref<InstanceType<typeof StylePanel> | null>(null)
// Stil paneli değişikliğinde seçim overlay + HUD tazele (panel 'changed' yayını).
const onStyleChanged = () => {
  drawSelectionOverlay()
  updateHud(true)
}

// Mobil seçim-toolbar'ı aynı op'ları kullanır (doğrudan çizer).
const { selAll, selCopy, selPaste, selDelete } = useSelectionOps(() => {
  drawSelectionOverlay()
  updateHud(true)
})
const filePanelRef = ref<InstanceType<typeof FileMenuPanel> | null>(null)
const moreBtn = ref<HTMLElement | null>(null)
const morePanel = ref<HTMLElement | null>(null)
const store = useDrawingStore()

// --- Uygulama-içi onay/soru diyaloğu (tekil durum useDialogs'ta;
// şablon burada, soru soran paneller aynı tekil diyaloğu kullanır) ---
const {
  dialogOpen,
  dialogKind,
  dialogTitle,
  dialogMessage,
  dialogText,
  dialogPanel,
  dialogInput,
  askConfirm,
  askPrompt,
  dialogOk,
  dialogCancel,
  trapIn,
} = useDialogs()
// l10n + araç etiketleri (tekil useLocale'ten; paneller de aynısını kullanır).
const { t, tf, locTools } = useLocale()

// Araç düğme metadatası: config/tools (TOOL_META).
// Hepsi gizlenirse kilitlenmemek için tam listeye düşer.
const visibleTools = computed(() => {
  const list = store.toolbarOrder.filter((t) => !store.hiddenTools.includes(t))
  return list.length > 0 ? list : [...store.toolbarOrder]
})
// Her pointermove'da overlay redraw yapma — frame başına en fazla 1 (rAF throttle).
let rafId = 0
// Kaydırmalı-mod zoom yerleşimi de kare başına en fazla 1: burst'te her adım
// backing-store realloc + tam sayfa boyası demekti (kasma). Bekleyen kare varsa
// yeni istek atlanır; rAF güncel state'i okuyup tek seferde işler.
let zoomRaf = 0
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
    ` e${drawingPerf.eraseMs.toFixed(1)}` +
    ` c${drawingPerf.cutMs.toFixed(1)}` +
    ` · ${store.drawingCount} ${t('lines')}` +
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
// Tek aktif pointer kilidi / pinch jesti / Space-pan durumu: usePointerState.
const ps = usePointerState()

const ptrPos = (e: PointerEvent) => {
  const r = overlayCanvas.value!.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

// --- Seçim jesti (select aracı): sayfa-uzayında marquee/lasso/taşıma ---
const {
  isSelActive,
  cancelSelGesture,
  drawSelectionOverlay,
  selInside,
  selectDown,
  selectMove,
  selectUp,
} = useSelectionGesture({
  overlayCanvas,
  store,
  ps,
  viewTransformTick,
  updateHud: (force) => updateHud(force),
})

// --- Metin jesti (text aracı): tıkla-oluştur/düzenle, sürükle-taşı ---
const {
  textOverlayRef,
  hasTextDown,
  cancelTextGesture,
  drawTextBoxOverlay,
  textDown,
  textMove,
  textUp,
  onTextInput,
  onTextSizeInput,
  onTextColorInput,
  closeTextEditor,
  delActiveText,
  activeTextScreenRect,
  textEditorContainerStyle,
} = useTextGesture({
  store,
  ps,
  overlayCanvas,
  viewTransformTick,
  updateHud: (force) => updateHud(force),
})

// --- Resim jesti (image aracı): boşa tıkla-ekle, resme tıkla-seç, sürükle-taşı ---
const {
  imgInput,
  hasImgDown,
  activeImageScreenRect,
  imageEditorContainerStyle,
  cancelImageGesture,
  imageDown,
  imageMove,
  imageUp,
  onImageFile,
  onImgWidth,
  delActiveImage,
} = useImageGesture({
  store,
  ps,
  overlayCanvas,
  viewTransformTick,
  updateHud: (force) => updateHud(force),
  showPdfError: (err) => showPdfError(err),
})

// --- El/Space kaydırma: ekran-px delta ile pan (her araçta Space ile) ---
const { isPanActive, panDown, panMove, panUp, cancelPan } = usePanGesture({
  store,
  ps,
  overlayCanvas,
  ptrPos,
  drawSelectionOverlay,
  updateHud: (force) => updateHud(force),
})

// Kaydırmalı modda parmak: canvas touch-action:none tutulur (kalem çizsin diye),
// parmak-sürükleme native scroll yerine MANUEL sürülür (scrollBox.scrollTop).
// Tap (kımıldamayan parmak) replay ile normal araç akışına sokulur — tıkla-düzenle yaşar.
interface PendingTouch {
  e: PointerEvent
  startX: number
  startY: number
  lastX: number
  lastY: number
  scrolled: boolean
}
let pendingTouch: PendingTouch | null = null
let replayingTap = false
const TAP_SLOP_SQ = 64 // 8px — blok tap eşiğiyle aynı

// Kaydırmalı-mod native scroll sürüşü (el/Space/orta-tuş/parmak): scrollBox'u
// doğrudan sürer, boya-pan YOK. viewPan'e dokunulmaz — slot/blok hizası bozulmasın
// diye scroll modda pan her zaman sıfırdır (store tarafı da sıfırlar/korur).
const driveScroll = (dx: number, dy: number) => {
  const box = scrollBox.value
  if (!box) return
  if (dx !== 0) box.scrollLeft -= dx
  if (dy !== 0) box.scrollTop -= dy
}
// El/Space/orta-tuş sürüş oturumu (fare/kalem; parmak pendingTouch yolunda).
let panDrive: { lastX: number; lastY: number } | null = null

const startDraw = (e: PointerEvent) => {
  // iPadOS ilk dokunuşu jest kararı için bekletmesin: olayı en başta sahiplen.
  // (touch-action:none ile birlikte; Apple Pencil hover'ı move tarafında zaten no-op.)
  e.preventDefault()
  resetBlockTap()
  if (!overlayCanvas.value) return
  store.clearCachedRect()
  // Avuç reddi pinch'ten ÖNCE: parmak (touchPan kapalıyken) hiç işleme girmez; yoksa
  // dinlenen avuç ikinci pointer olup aktif kalem çizgisini iptal ediyordu.
  // Kaydırmalı modda reddetme YOK: parmak scroll/pinch sayacı için izlenir, çizim
  // zaten aşağıdaki scroll-adayı dalında engellenir.
  if (e.pointerType === 'touch' && store.rejectTouch && !store.touchPan && !scrollMode.value) return
  ps.track(e.pointerId, ptrPos(e))
  if (ps.count() === 2) {
    store.cancelActiveStroke()
    cancelSelGesture()
    cancelTextGesture()
    cancelImageGesture()
    cancelPan()
    pendingTouch = null
    panDrive = null
    if (rafId !== 0) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    ps.clearActive()
    ps.beginGesture()
    return
  }
  if (ps.count() !== 1 || ps.gestureLocked()) return
  // Kaydırmalı modda parmak = scroll adayı: araçlara girmeden bekle, sürüklenirse
  // manuel scroll sür (draw tarafı), kımıldamazsa endDraw replay ile tap işletir.
  // Kalem/fare etkilenmez (sıfır-gecikme çizim korunur).
  if (scrollMode.value && e.pointerType === 'touch' && !replayingTap) {
    try {
      overlayCanvas.value?.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    ps.setActive(e.pointerId)
    pendingTouch = {
      e,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      scrolled: false,
    }
    return
  }
  // Dokun-kaydır açıksa parmak her araçta kaydırır (kalem/fare etkilenmez).
  if (e.pointerType === 'touch' && store.touchPan) {
    panDown(e)
    return
  }
  // Space-kaydırma her aracı ezer (pinch sonrası değil); el aracı dokunmayla da kaydırır.
  // Kaydırmalı modda el/Space/orta-tuş NATIVE scroll sürer (boya-pan YOK).
  if (scrollMode.value && (ps.spacePan() || store.currentTool === 'hand' || (e.pointerType === 'mouse' && e.button === 1))) {
    if (e.pointerType === 'mouse' && e.button === 1) e.preventDefault()
    try {
      overlayCanvas.value?.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    ps.setActive(e.pointerId)
    panDrive = { lastX: e.clientX, lastY: e.clientY }
    return
  }
  if (ps.spacePan() || store.currentTool === 'hand') {
    panDown(e)
    return
  }
  // Orta tuş (yalnızca fare): her araçta el gibi kaydırır. Stylus'a dokunulmaz —
  // kalem gövde tuşları button 2/5 + pointerType 'pen' üretir, bu kapıdan geçemez.
  if (e.pointerType === 'mouse' && e.button === 1) {
    e.preventDefault()
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
  ps.setActive(e.pointerId)
  scheduleRender()
}

const draw = (e: PointerEvent) => {
  if (e.cancelable) e.preventDefault()
  if (ps.has(e.pointerId) && overlayCanvas.value) {
    const r = overlayCanvas.value.getBoundingClientRect()
    ps.moveTracked(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top })
  }
  const step = ps.stepGesture()
  if (step) {
    if (step.scale > 0) store.pinch(step.scale, step.midX, step.midY, step.dx, step.dy)
    // Kaydırmalı modda saf iki-parmak öteleme native scroll'u sürer (store
    // boya-pan yapmaz; ölçekli adımın ötelemesi pinch çapasının içindedir).
    if (scrollMode.value && step.scale === 1 && (step.dx !== 0 || step.dy !== 0)) {
      driveScroll(step.dx, step.dy)
    }
    updateHud()
    drawSelectionOverlay()
    return
  }
  // Kaydırmalı modda parmak-sürükleme: mürekkep YOK, scrollBox manuel sürülür.
  // Eşik altı kımıldama tap sayılır (bırakışta replay). Araç dallarından ÖNCE.
  if (pendingTouch && e.pointerType === 'touch' && ps.isActive(e.pointerId)) {
    const t = pendingTouch
    const dx = e.clientX - t.lastX
    const dy = e.clientY - t.lastY
    t.lastX = e.clientX
    t.lastY = e.clientY
    if (!t.scrolled) {
      const sx = e.clientX - t.startX
      const sy = e.clientY - t.startY
      if (sx * sx + sy * sy > TAP_SLOP_SQ) t.scrolled = true
    }
    if (t.scrolled) {
      driveScroll(dx, dy)
    }
    return
  }
  // Kaydırmalı-mod el/Space/orta-tuş sürüşü: native scroll, boya-pan yok.
  if (panDrive && ps.isActive(e.pointerId)) {
    driveScroll(e.clientX - panDrive.lastX, e.clientY - panDrive.lastY)
    panDrive.lastX = e.clientX
    panDrive.lastY = e.clientY
    return
  }
  if (store.currentTool === 'select') {
    selectMove(e)
    return
  }
  if (isPanActive()) {
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
  if (!store.isDrawing || ps.activeId() === null || !ps.isActive(e.pointerId)) return
  // Sadece basılıyken çiz (pointermove hover'da ateşlenir)
  if (e.buttons === 0 && e.pointerType === 'mouse') return
  // coalesced events: birikmiş ara noktaları da işle, çizgi köşelenmesin
  for (const ev of coalescedOf(e)) store.draw(ev)
  scheduleRender()
}

const endDraw = (e?: PointerEvent) => {
  // Gesture bitene (tüm parmaklar kalkana) kadar çizim kapalı — arta kalan parmak çizmesin.
  const rel = ps.releasePointer(e?.pointerId)
  if (rel.tapAction === 'undo') {
    undo()
    return
  } else if (rel.tapAction === 'redo') {
    redo()
    return
  }
  if (rel.locked) return
  // Kaydırmalı-mod sürüş oturumu: iş bitmiştir (scroll'du), kilidi bırak.
  if (panDrive) {
    panDrive = null
    ps.clearActive()
    updateHud(true)
    return
  }
  // Kaydırmalı-mod parmak adayı: sürüklendiyse iş bitmiştir (scroll'du, çizim yok).
  // Kımıldamadıysa tap'ti — down olayını replay ile normal araç akışına sok,
  // aşağıdan standart commit yolu devam etsin (nokta/metin/seçim tıkı çalışır).
  if (pendingTouch) {
    const t = pendingTouch
    pendingTouch = null
    ps.clearActive()
    if (t.scrolled) {
      updateHud(true)
      return
    }
    replayingTap = true
    try {
      startDraw(t.e)
    } finally {
      replayingTap = false
    }
    // Replay kilit kurduysa (ya da kuramadıysa) normal akışa düş: kurduysa commit,
    // kuramadıysa isDrawing kapıları zaten kapalı, no-op.
  }
  // Aktif pointer kilidini pahalı commit'ten ÖNCE bırak: stopDrawing (snapshotDoc
  // tam-klon + base'e işleme) bitmeden gelen pointerdown temiz görsün, yoksa
  // isDrawing/pointerId kapılarına takılıp ilk vuruş sessizce yutuluyordu.
  // Alt dalların (selectUp/panUp/...) pointerId guard'ı null'da geçişlidir,
  // pinch kilidi yukarıda aynen korunur.
  ps.clearActive()
  if (isSelActive() || store.currentTool === 'select') {
    selectUp(e)
    return
  }
  if (isPanActive()) {
    panUp(e)
    return
  }
  if (hasTextDown() || store.currentTool === 'text') {
    textUp(e)
    return
  }
  if (hasImgDown() || store.currentTool === 'image') {
    imageUp(e)
    return
  }
  if (!store.isDrawing) return
  // isDrawing tek gerçek kapı (startDrawing zaten isDrawing'deyken reddeder).
  if (rafId !== 0) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
  // stopDrawing stroke'u base'e işler + overlay'i temizler — ek redraw gerekmez.
  store.stopDrawing()
  updateHud(true)
}

// pointercancel = "bu jest'e güvenme": KESİNLİKLE commit yok. Tarayıcı scroll'u
// devraldığında, kesintide vs. gelir — yarım stroke/base'e işlenmemeli.
const cancelDraw = (e?: PointerEvent) => {
  ps.releasePointer(e?.pointerId)
  pendingTouch = null
  panDrive = null
  if (rafId !== 0) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
  if (isSelActive()) cancelSelGesture()
  if (hasTextDown()) cancelTextGesture()
  if (hasImgDown()) cancelImageGesture()
  if (isPanActive()) cancelPan()
  if (store.isDrawing) store.cancelActiveStroke()
  ps.clearActive()
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

const { onKeyDown, onKeyUp } = useCanvasShortcuts({
  quickSaveDoc: () => quickSaveDoc(),
  presenting,
  togglePresent: () => togglePresent(),
  closeMenus: () => closeMenus(),
  dialogOpen,
  dialogCancel,
  nextPage: () => nextPage(),
  prevPage: () => prevPage(),
  isAnyPanelOpen: () =>
    showFile.value ||
    showSettings.value ||
    showLayers.value ||
    showStyle.value ||
    showMore.value,
  ps,
  store,
  drawSelectionOverlay: () => drawSelectionOverlay(),
  updateHud: (force) => updateHud(force),
  isSelActive: () => isSelActive(),
  cancelSelGesture: () => cancelSelGesture(),
  closeTextEditor: () => closeTextEditor(),
  cancelImageGesture: () => cancelImageGesture(),
  showFile,
})

const {
  pdfError,
  showPdfError,
  calemInput,
  xoppInput,
  exportPng,
  onPdfFile,
  exportPdfDoc,
  quickSaveDoc,
  openCalemDoc,
  openLaunchedFile,
  drainLaunchSlot,
  onCalemFile,
  openXoppDoc,
  onXoppFile,
  exportXoppDoc,
  askClosePdf,
} = useCanvasFileActions({
  store,
  showFile,
  t,
  askConfirm,
  updateHud: (force) => updateHud(force),
  refreshThumbs: () => refreshThumbs(),
})

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
  if (showStyle.value) {
    showStyle.value = false
    closed = true
  }
  if (showMore.value) {
    showMore.value = false
    closed = true
  }
  return closed
}

const onDocPointerDown = (e: PointerEvent) => {
  const t = e.target as Node | null
  if (!t || !(t instanceof Node)) return
  const inside = (el: HTMLElement | null) => !!el && el.contains(t)
  if (showFile.value && !inside(fileMenu.value) && !inside(filePanelRef.value?.panelEl ?? null)) showFile.value = false
  if (showSettings.value && !inside(settingsBtn.value) && !inside(settingsPanelRef.value?.panelEl ?? null)) {
    showSettings.value = false
  }
  if (showLayers.value && !inside(layersBtn.value) && !inside(layersPanelRef.value?.panelEl ?? null)) {
    showLayers.value = false
  }
  if (showStyle.value && !inside(styleBtn.value) && !inside(stylePanelRef.value?.panelEl ?? null)) {
    showStyle.value = false
  }
  if (showMore.value && !inside(moreBtn.value) && !inside(morePanel.value)) {
    showMore.value = false
  }
}

// Temizle yıkıcı bir op: diğer silmelerle aynı korumayı uygula.
const askClearCanvas = async () => {
  if (store.hasInk && !(await askConfirm(tf('clearPageAsk', store.activePageIndex + 1)))) return
  clearCanvas()
}

const clearCanvas = () => {
  ps.clearActive()
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

// Sekme/app kapanırken IDB'ye flush'lanmamış iş varsa tarayıcı "emin misin"
// sorar (flush'lanmış iş IDB'de güvende, banner'dan geri gelir — boşuna sormayız).
const onBeforeUnload = (e: BeforeUnloadEvent) => {
  if (store.hasInk && store.pendingSave) e.preventDefault()
}
// Kapanışta son yazımı IDB'ye itmeyi dene (async garantisi yok, best-effort).
const onPageHide = () => {
  if (store.pendingSave) void store.persistNow()
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
  const msg = tf('delPageAsk', store.activePageIndex + 1)
  if (!(await askConfirm(msg, tf('strokesLost', store.drawingCount)))) return
  ps.clearActive()
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
  if (store.hasInk && !(await askConfirm(t('restoreReplace')))) return
  const ok = await store.loadPersisted()
  if (!ok) showPdfError(t('loadFailed'))
  updateHud(true)
  refreshThumbs()
}

const {
  scrollMode,
  scrollBox,
  activeSlot,
  blockEls,
  setBlockRef,
  positionSlot,
  scrollActiveIntoView,
  activatePageInPlace,
  onScrollBox,
  onBlockDown,
  onBlockUp,
  refreshBlocks,
  toggleScroll,
  resetBlockTap,
  takeHoldNav,
} = useScrollMode({
  store,
  ps,
  cancelAllGestures: () => {
    cancelSelGesture()
    cancelTextGesture()
    cancelImageGesture()
    cancelPan()
  },
  bindCanvases: () => bindCanvases(),
  drawSelectionOverlay: () => drawSelectionOverlay(),
  updateHud: (force) => updateHud(force),
})

const sizeCanvas = () => {
  if (!baseCanvas.value || !overlayCanvas.value) return
  if (scrollMode.value) positionSlot()
  store.resizeCanvas()
  drawSelectionOverlay()
}

// Görünür alan yüksekliği (px). visualViewport pinch içermez (zoom kapalı), en doğru ölçüdür.
const appHeightPx = ref<number | null>(null)
const syncAppHeight = () => {
  const h = window.visualViewport?.height ?? window.innerHeight
  if (Number.isFinite(h) && h > 0) appHeightPx.value = Math.round(h)
}

// Seçim değişince bbox'ı tazele (taşıma nokta-mutasyonu, id aynı — orası explicit redraw).
let stopSelWatch: (() => void) | null = null
let stopTextWatch: (() => void) | null = null
let stopPageWatch: (() => void) | null = null
let stopSettingsWatch: (() => void) | null = null
let stopChromeWatch: (() => void) | null = null
let stopToolWatch: (() => void) | null = null
let stopZoomWatch: (() => void) | null = null
let offLaunch: (() => void) | null = null

// Sayfa şeridi: düşük çözünürlüklü önbellek, tick+sayfa-değişiminde debounce'lu tazelenir.
const thumbs = ref<string[]>([])
let thumbTimer: ReturnType<typeof setTimeout> | undefined
let stopThumbWatch: (() => void) | null = null
const refreshThumbs = () => {
  // Şerit görünmüyorsa (tek sayfa / kapalı) thumbnail üretme: aksi halde her silme
  // bırakışında tüm sayfa render + toDataURL (GPU readback) yapılıp bir sonraki
  // sürüklemenin üstüne denk gelerek kasardı.
  if (!store.pageStripOpen || store.pages.length <= 1) {
    if (thumbTimer) {
      clearTimeout(thumbTimer)
      thumbTimer = undefined
    }
    if (thumbs.value.length > 0) thumbs.value = []
    return
  }
  if (thumbTimer) clearTimeout(thumbTimer)
  thumbTimer = setTimeout(() => {
    thumbTimer = undefined
    // Görünürlük kapanmış olabilir / çizim sürüyor olabilir — ikisinde de ertele.
    if (!store.pageStripOpen || store.pages.length <= 1) {
      if (thumbs.value.length > 0) thumbs.value = []
      return
    }
    if (store.isDrawing) {
      refreshThumbs()
      return
    }
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

// Biçim/yön değişimi boş aktif sayfaya anında işlediyse şeridi ve slotu tazele.
const onPageLayoutChange = (applied: boolean) => {
  if (!applied) return
  refreshThumbs()
  updateHud(true)
  if (scrollMode.value) {
    refreshBlocks()
    nextTick(() => {
      positionSlot()
      store.resizeCanvas()
    })
  }
}

// Canvas initialization
// Canvas'lar mod değişiminde remount olur → ref'leri + wheel'i yeniden bağlar.
// iPadOS Safari: touch jestleri passive listener'da engellenemez; non-passive
// native bloklayıcılar Scribble/callout/pinch kararını çizimden önce öldürür.
const blockGesture = (e: Event) => e.preventDefault()
const bindCanvases = () => {
  if (!baseCanvas.value || !overlayCanvas.value) return false
  overlayCanvas.value.style.touchAction = 'none'
  store.setCanvasRef(baseCanvas.value)
  store.setOverlayRef(overlayCanvas.value)
  overlayCanvas.value.removeEventListener('wheel', onWheel)
  overlayCanvas.value.addEventListener('wheel', onWheel, { passive: false })
  for (const t of ['touchstart', 'touchmove', 'gesturestart', 'gesturechange'] as const) {
    overlayCanvas.value.removeEventListener(t, blockGesture)
    overlayCanvas.value.addEventListener(t, blockGesture, { passive: false })
  }
  return true
}

onMounted(() => {
  bindCanvases()
  // Önce ayarlar (kâğıt rengi), sonra ilk boya — yanlış renk flaşı yok.
  // Otomatik oturum yükleme YOK: kayıt varsa banner çıkar, seçim kullanıcıda.
  store
    .loadSettings()
    .then(() => {
      // Boyut hazır olana kadar bekleyen kurulum (mobil açılışta 0px yarışı).
      store.ensureCanvasReady()
      return store.checkSavedSession()
    })
    .then(() => {
      updateHud(true)
      refreshThumbs()
    })
  updateHud(true)

  mobileMq = window.matchMedia('(max-width: 639px)')
  narrowMq = window.matchMedia('(max-width: 899px)')
  syncIsMobile()
  mobileMq.addEventListener('change', syncIsMobile)
  narrowMq.addEventListener('change', syncIsMobile)
  window.addEventListener('resize', sizeCanvas)
  // Mobil URL barı açılıp kapanınca window.resize ateşlenmez; visualViewport yakalar.
  window.visualViewport?.addEventListener('resize', sizeCanvas)
  // Kök yükseklik: dvh desteksiz tarayıcıda 100vh fold altına taşar, alt bar kaybolur.
  // innerHeight/visualViewport her yerde doğru ölçer; mount sonrası JS devralır.
  syncAppHeight()
  window.addEventListener('resize', syncAppHeight)
  window.visualViewport?.addEventListener('resize', syncAppHeight)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  // Kapanışta yazılmamış iş varsa tarayıcı onayı (metni tarayıcı yazar,
  // özelleştirilemez); pagehide'da son flush denenir (best-effort).
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('pagehide', onPageHide)
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
  // Araç değişiminde (örn. metin aracından çıkınca veya girince header yüksekliği değişebilir)
  // canvas boyutu ve konumu sync edilsin, çizim koordinatları kaymasın.
  stopToolWatch = watch(
    () => store.currentTool,
    () => {
      store.clearCachedRect()
      nextTick(() => sizeCanvas())
    },
  )
  // Diyalog açılınca ilk kontrole odaklan, kapanınca tetikleyiciye dön.
  stopSettingsWatch = watch(showSettings, (open) => {
    if (open) {
      nextTick(() =>
        settingsPanelRef.value?.panelEl?.querySelector<HTMLElement>('button, input, select, textarea')?.focus(),
      )
    } else {
      settingsBtn.value?.querySelector<HTMLElement>('button')?.focus()
    }
  })
  // Editör açılınca fareyi bekletme — klavye hazır gelsin.
  stopTextWatch = watch(
    () => store.activeTextId,
    (id) => {
      if (id) nextTick(() => textOverlayRef.value?.focus())
    },
  )
  stopThumbWatch = watch(
    () => [store.thumbTick, store.pages, store.pageStripOpen] as const,
    refreshThumbs,
  )
  // Zoom değişince kaydırmalı yerleşimi yenile (tekli modda etkisiz).
  // nextTick ŞART: blok genişliği (zoomFactor*100%) DOM'a işlenmeden ölçülürse
  // slot bir kare bayat kalıyor ve zoom sonrası yerleşim bozuluyordu.
  stopZoomWatch = watch(
    () => store.zoomLabel,
    () => {
      if (!scrollMode.value) return
      if (zoomRaf !== 0) return
      zoomRaf = requestAnimationFrame(() => {
        zoomRaf = 0
        if (!scrollMode.value) return
        nextTick(() => {
          positionSlot()
          // resizeCanvas: taze layout + bekleyen zoom çapası + boya (tek seferde).
          store.resizeCanvas()
          refreshBlocks()
          drawSelectionOverlay()
          // Bilerek kaydırma YOK: slot kökeni zoom'da sabittir, çapa boyayı
          // imleçte tutar; scrollIntoView her adımda görünümü zıplatıyordu.
        })
      })
    },
  )
  // PWA dosya ilişkilendirme: soğuk açılışta slottaki handle + sıcak açılışlar.
  drainLaunchSlot()
  offLaunch = onLaunchHandle(drainLaunchSlot)
  refreshThumbs()
  stopPageWatch = watch(
    () => store.activePageIndex,
    () => {
      if (!scrollMode.value) return
      nextTick(() => {
        positionSlot()
        store.resizeCanvas()
        drawSelectionOverlay()
        refreshBlocks()
        // Yerinde aktivasyonda (tık/spy) görünümü zıplatma.
        if (!takeHoldNav()) scrollActiveIntoView()
      })
    },
  )
})

onUnmounted(() => {
  if (rafId !== 0) cancelAnimationFrame(rafId)
  if (zoomRaf !== 0) cancelAnimationFrame(zoomRaf)
  zoomRaf = 0
  ps.clearActive()
  cancelSelGesture()
  cancelTextGesture()
  cancelImageGesture()
  cancelPan()
  ps.setSpacePan(false)
  ps.clearPointers()
  ps.clearGesture()
  stopSelWatch?.()
  stopSelWatch = null
  stopTextWatch?.()
  stopTextWatch = null
  stopThumbWatch?.()
  stopThumbWatch = null
  if (thumbTimer) clearTimeout(thumbTimer)
  thumbTimer = undefined
  stopPageWatch?.()
  stopPageWatch = null
  stopSettingsWatch?.()
  stopSettingsWatch = null
  stopChromeWatch?.()
  stopChromeWatch = null
  stopToolWatch?.()
  stopToolWatch = null
  stopZoomWatch?.()
  stopZoomWatch = null
  offLaunch?.()
  offLaunch = null
  mobileMq?.removeEventListener('change', syncIsMobile)
  mobileMq = null
  narrowMq?.removeEventListener('change', syncIsMobile)
  narrowMq = null
  window.removeEventListener('resize', sizeCanvas)
  window.visualViewport?.removeEventListener('resize', sizeCanvas)
  window.removeEventListener('resize', syncAppHeight)
  window.visualViewport?.removeEventListener('resize', syncAppHeight)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('pagehide', onPageHide)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  document.removeEventListener('pointerdown', onDocPointerDown)
  overlayCanvas.value?.removeEventListener('wheel', onWheel)
  for (const t of ['touchstart', 'touchmove', 'gesturestart', 'gesturechange'] as const) {
    overlayCanvas.value?.removeEventListener(t, blockGesture)
  }
  store.setCanvasRef(null)
  store.setOverlayRef(null)
})
</script>

<style scoped>
canvas {
  -webkit-tap-highlight-color: transparent;
  touch-action: none;
  -webkit-touch-callout: none;
  user-select: none;
  -webkit-user-select: none;
}
</style>
