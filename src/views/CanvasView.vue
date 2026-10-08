<template>
  <div class="h-screen flex flex-col bg-[var(--page-bg)] overflow-hidden">
    <header class="relative z-10 shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 bg-[var(--chrome-bg)] border-b border-[var(--chrome-border)]">
      <div class="relative">
        <button
          @click="showFile = !showFile"
          class="px-3 py-1 rounded text-xs font-medium text-[var(--chrome-text)] hover:text-[var(--chrome-title)] transition"
          :class="{ 'bg-[var(--chrome-bg-soft)] text-white': showFile }"
          title="Dosya işlemleri"
        >
          Dosya
        </button>
        <div
          v-if="showFile"
          class="absolute left-0 top-full mt-1 z-20 w-56 rounded-lg bg-[var(--chrome-bg)] border border-[var(--chrome-border-strong)] p-1.5 text-xs shadow-xl"
          role="menu"
          aria-label="Dosya"
        >
          <label
            class="block w-full text-left px-3 py-1.5 rounded text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] transition cursor-pointer"
            :class="{ 'opacity-40 pointer-events-none': store.pdfBusy }"
            title="PDF aç — sayfalar PDF sayfalarıyla değişir"
          >
            PDF Aç…
            <input
              type="file"
              accept="application/pdf,.pdf"
              class="hidden"
              :disabled="store.pdfBusy"
              @change="onPdfFile"
            />
          </label>
          <button
            @click="exportPdfDoc"
            :disabled="store.pdfBusy"
            class="block w-full text-left px-3 py-1.5 rounded text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] transition disabled:opacity-40 disabled:cursor-not-allowed"
            title="Konum + isim seçerek PDF olarak indir"
          >
            PDF Yaz…
          </button>
          <button
            @click="exportPng"
            class="block w-full text-left px-3 py-1.5 rounded text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] transition"
            title="Aktif sayfayı PNG indir"
          >
            PNG İndir
          </button>
          <div
            v-if="store.pdfName || store.lastSavedAt"
            class="mt-1 pt-1 border-t border-[var(--chrome-border)] px-3 py-1 text-[10px] text-[var(--chrome-faint)] font-mono truncate"
          >
            <span v-if="store.pdfName" :title="store.pdfName">
              {{ store.pdfName }}
              <button @click="askClosePdf" class="text-[var(--chrome-muted)] hover:text-[var(--chrome-title)] underline" title="PDF'i kapat">
                Kapat
              </button>
            </span>
            <span v-if="store.lastSavedAt" :title="`Otomatik kayıt (IndexedDB)`">
              {{ store.pdfName ? ' · ' : '' }}kayıtlı {{ store.lastSavedAt }}
            </span>
          </div>
        </div>
      </div>

      <div class="relative">
        <button
          @click="showSettings = !showSettings"
          class="px-3 py-1 rounded text-xs font-medium text-[var(--chrome-text)] hover:text-[var(--chrome-title)] transition"
          :class="{ 'bg-[var(--chrome-bg-soft)] text-white': showSettings }"
          title="Ayarlar"
        >
          Ayarlar
        </button>
      </div>

      <div class="flex items-center gap-1 p-1 rounded-lg bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border)]" role="toolbar" aria-label="Araçlar">
        <button
          @click="store.setTool('pen')"
          :class="store.currentTool === 'pen' ? 'bg-indigo-600 text-white' : 'text-[var(--chrome-text)] hover:text-[var(--chrome-title)]'"
          class="px-3 py-1 rounded text-xs font-medium transition flex items-center gap-1"
          title="Kalem"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7l7 9z" />
          </svg>
          Kalem
        </button>

        <button
          @click="store.setTool('highlighter')"
          :class="store.currentTool === 'highlighter' ? 'bg-yellow-500 text-black' : 'text-[var(--chrome-text)] hover:text-[var(--chrome-title)]'"
          class="px-3 py-1 rounded text-xs font-medium transition flex items-center gap-1"
          title="Vurgulayıcı"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 11l3 3m-2.5-2.5L4 17l5-1.5L19.5 5 15 3.5 9.5 8.5z" />
          </svg>
          Vurgu
        </button>

        <button
          @click="store.setTool('eraser')"
          :class="store.currentTool === 'eraser' ? 'bg-red-600 text-white' : 'text-[var(--chrome-text)] hover:text-[var(--chrome-title)]'"
          class="px-3 py-1 rounded text-xs font-medium transition flex items-center gap-1"
          title="Silgi"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.832A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.832L3 7m12 4h4m4-4v4m-4-6h4m-5.303-5.303L16 16" />
          </svg>
          Silgi
        </button>

        <button
          @click="store.setTool('select')"
          :class="store.currentTool === 'select' ? 'bg-indigo-600 text-white' : 'text-[var(--chrome-text)] hover:text-[var(--chrome-title)]'"
          class="px-3 py-1 rounded text-xs font-medium transition flex items-center gap-1"
          title="Seç/Taşı (V)"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3l14 7-6 2-2 6-6-15z" />
          </svg>
          Seç
        </button>

        <span class="w-px h-4 bg-[var(--chrome-border)]"></span>

        <button
          @click="store.setTool('line')"
          :class="store.currentTool === 'line' ? 'bg-indigo-600 text-white' : 'text-[var(--chrome-text)] hover:text-[var(--chrome-title)]'"
          class="px-2 py-1 rounded text-xs font-medium transition"
          title="Çizgi (L)"
        >
          Çizgi
        </button>
        <button
          @click="store.setTool('rect')"
          :class="store.currentTool === 'rect' ? 'bg-indigo-600 text-white' : 'text-[var(--chrome-text)] hover:text-[var(--chrome-title)]'"
          class="px-2 py-1 rounded text-xs font-medium transition"
          title="Kare (R)"
        >
          Kare
        </button>
        <button
          @click="store.setTool('ellipse')"
          :class="store.currentTool === 'ellipse' ? 'bg-indigo-600 text-white' : 'text-[var(--chrome-text)] hover:text-[var(--chrome-title)]'"
          class="px-2 py-1 rounded text-xs font-medium transition"
          title="Elips (O)"
        >
          Elips
        </button>
        <button
          @click="store.setTool('arrow')"
          :class="store.currentTool === 'arrow' ? 'bg-indigo-600 text-white' : 'text-[var(--chrome-text)] hover:text-[var(--chrome-title)]'"
          class="px-2 py-1 rounded text-xs font-medium transition"
          title="Ok (A)"
        >
          Ok
        </button>
        <button
          @click="store.setTool('text')"
          :class="store.currentTool === 'text' ? 'bg-indigo-600 text-white' : 'text-[var(--chrome-text)] hover:text-[var(--chrome-title)]'"
          class="px-2 py-1 rounded text-xs font-medium transition"
          title="Metin (T)"
        >
          Metin
        </button>
        <button
          @click="store.setTool('image')"
          :class="store.currentTool === 'image' ? 'bg-indigo-600 text-white' : 'text-[var(--chrome-text)] hover:text-[var(--chrome-title)]'"
          class="px-2 py-1 rounded text-xs font-medium transition"
          title="Resim (G)"
        >
          Resim
        </button>
      </div>

      <div
        v-if="store.currentTool === 'select'"
        class="flex items-center gap-1 p-1 rounded-lg bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border)]"
        role="toolbar"
        aria-label="Seçim işlemleri"
      >
        <button
          @click="store.setSelectMode('rect')"
          :class="store.selectMode === 'rect' ? 'bg-indigo-600 text-white' : 'text-[var(--chrome-text)] hover:text-[var(--chrome-title)]'"
          class="px-2 py-1 rounded text-xs font-medium transition"
          title="Kare seçim"
        >
          Kare
        </button>
        <button
          @click="store.setSelectMode('lasso')"
          :class="store.selectMode === 'lasso' ? 'bg-indigo-600 text-white' : 'text-[var(--chrome-text)] hover:text-[var(--chrome-title)]'"
          class="px-2 py-1 rounded text-xs font-medium transition"
          title="Kement seçim"
        >
          Kement
        </button>
        <span class="w-px h-4 bg-[var(--chrome-border)]"></span>
        <button
          @click="selAll"
          class="px-2 py-1 rounded text-xs text-[var(--chrome-text)] hover:text-[var(--chrome-title)] transition"
          title="Tümünü seç (Ctrl+A)"
        >
          Tümü
        </button>
        <button
          @click="selCopy"
          :disabled="store.selectionCount === 0"
          class="px-2 py-1 rounded text-xs text-[var(--chrome-text)] hover:text-[var(--chrome-title)] transition disabled:opacity-40 disabled:cursor-not-allowed"
          title="Kopyala (Ctrl+C)"
        >
          Kopyala
        </button>
        <button
          @click="selPaste"
          :disabled="store.clipboardCount === 0"
          class="px-2 py-1 rounded text-xs text-[var(--chrome-text)] hover:text-[var(--chrome-title)] transition disabled:opacity-40 disabled:cursor-not-allowed"
          title="Yapıştır (Ctrl+V)"
        >
          Yapıştır
        </button>
        <button
          @click="selDelete"
          :disabled="store.selectionCount === 0"
          class="px-2 py-1 rounded text-xs text-[var(--chrome-text)] hover:text-red-400 transition disabled:opacity-40 disabled:cursor-not-allowed"
          title="Seçiliyi sil (Del)"
        >
          Sil<span v-if="store.selectionCount > 0" class="font-mono"> ({{ store.selectionCount }})</span>
        </button>
      </div>

      <div v-if="store.currentTool !== 'select'" class="flex items-center gap-1.5" role="toolbar" aria-label="Renk paleti">
        <button
          v-for="hex in PALETTE"
          :key="hex"
          @click="store.setColor(hex)"
          :title="hex"
          class="w-6 h-6 rounded-full border transition"
          :class="store.color.toLowerCase() === hex ? 'border-[var(--chrome-title)] scale-110' : 'border-white/25 hover:border-white/60'"
          :style="{ background: hex }"
        ></button>
        <input
          type="color"
          :value="store.color"
          @input="store.setColor(($event.target as HTMLInputElement).value)"
          class="w-6 h-6 rounded-full bg-transparent border border-dashed border-white/30 cursor-pointer p-0"
          title="Özel renk"
        />
      </div>

      <div v-if="store.currentTool !== 'select' && store.currentTool !== 'text' && store.currentTool !== 'image'" class="flex items-center gap-2">
        <span class="text-sm text-[var(--chrome-muted)]">Kalınlık:</span>
        <input
          type="range"
          :min="store.widthMin"
          :max="store.widthMax"
          :value="store.strokeWidth"
          @input="store.setStrokeWidth(Number(($event.target as HTMLInputElement).value))"
          class="w-24 accent-indigo-600"
        />
        <span class="text-xs text-[var(--chrome-text)] w-6 text-right">{{ store.strokeWidth }}</span>
      </div>

      <div v-if="store.currentTool === 'text'" class="flex items-center gap-2">
        <span class="text-sm text-[var(--chrome-muted)]">Yazı:</span>
        <input
          type="range"
          min="8"
          max="72"
          step="1"
          :value="store.textSize"
          @input="store.setTextSize(Number(($event.target as HTMLInputElement).value))"
          class="w-24 accent-indigo-600"
          title="Yeni metinlerin boyu (pt)"
        />
        <span class="text-xs text-[var(--chrome-text)] w-6 text-right">{{ store.textSize }}</span>
      </div>

      <button
        @click="undo"
        :disabled="store.strokes.length === 0"
        class="px-3 py-1 rounded text-xs font-medium text-[var(--chrome-text)] hover:text-[var(--chrome-title)] transition disabled:opacity-40 disabled:cursor-not-allowed"
        title="Geri al (Ctrl+Z)"
      >
        Geri al
      </button>

      <button
        @click="redo"
        :disabled="store.redoStack.length === 0"
        class="px-3 py-1 rounded text-xs font-medium text-[var(--chrome-text)] hover:text-[var(--chrome-title)] transition disabled:opacity-40 disabled:cursor-not-allowed"
        title="Yinele (Ctrl+Y / Ctrl+Shift+Z)"
      >
        Yinele
      </button>

      <span v-if="store.pdfBusy" class="text-[10px] text-yellow-400/80 font-mono">işleniyor…</span>
      <span v-if="pdfError" class="text-[10px] text-red-400 font-mono">{{ pdfError }}</span>

      <div
        v-if="showSettings"
        class="absolute left-2 top-full mt-1 z-20 w-64 rounded-lg bg-[var(--chrome-bg)] border border-[var(--chrome-border-strong)] p-3 text-xs text-[var(--chrome-text)] shadow-xl"
        role="dialog"
        aria-label="Ayarlar"
      >
        <div class="flex items-center justify-between mb-2">
          <span class="font-medium text-[var(--chrome-title)]">Ayarlar</span>
          <button @click="showSettings = false" class="text-[var(--chrome-faint)] hover:text-[var(--chrome-title)]" title="Kapat">
            Kapat
          </button>
        </div>

        <div class="mb-1 text-[var(--chrome-muted)]">Arayüz teması</div>
        <div class="flex gap-1 mb-3">
          <button
            @click="store.setUiTheme('koyu')"
            class="flex-1 px-2 py-1 rounded transition"
            :class="store.uiTheme === 'koyu' ? 'bg-indigo-600 text-white' : 'bg-[var(--chrome-bg-soft)] hover:bg-[var(--chrome-bg-soft)]'"
          >
            Koyu
          </button>
          <button
            @click="store.setUiTheme('acik')"
            class="flex-1 px-2 py-1 rounded transition"
            :class="store.uiTheme === 'acik' ? 'bg-indigo-600 text-white' : 'bg-[var(--chrome-bg-soft)] hover:bg-[var(--chrome-bg-soft)]'"
          >
            Açık
          </button>
        </div>

        <div class="mb-1 text-[var(--chrome-muted)]">Kâğıt teması</div>
        <div class="flex gap-2 mb-2">
          <button
            v-for="(hex, name) in PAPER_THEMES"
            :key="name"
            @click="store.setPaper(hex)"
            :title="String(name)"
            class="w-8 h-8 rounded-full border-2 transition"
            :class="store.paper === hex ? 'border-[var(--chrome-title)]' : 'border-white/20 hover:border-white/50'"
            :style="{ background: hex }"
          ></button>
        </div>

        <div class="flex gap-1 mb-2">
          <select
            :value="store.paperBackground.type"
            @change="store.setPaperBackground({ type: ($event.target as HTMLSelectElement).value as typeof store.paperBackground.type })"
            class="flex-1 px-2 py-1 rounded bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border-strong)] text-[var(--chrome-title)]"
            title="Kâğıt deseni"
          >
            <option value="blank">Boş</option>
            <option value="ruled">Çizgili</option>
            <option value="graph">Kareli</option>
            <option value="dotted">Noktalı</option>
            <option value="staff">Notalı</option>
          </select>
          <input
            type="color"
            :value="store.paperBackground.lineColor"
            @input="store.setPaperBackground({ lineColor: ($event.target as HTMLInputElement).value })"
            class="w-8 h-8 rounded bg-transparent border border-[var(--chrome-border-strong)] cursor-pointer p-0.5"
            title="Desen rengi"
          />
        </div>

        <div v-if="store.paperBackground.type !== 'blank'" class="flex items-center gap-2 mb-2">
          <span class="text-[var(--chrome-faint)] whitespace-nowrap">Aralık</span>
          <input
            type="range"
            min="12"
            max="48"
            step="1"
            :value="store.paperBackground.spacing"
            @input="store.setPaperBackground({ spacing: Number(($event.target as HTMLInputElement).value) })"
            class="flex-1 accent-indigo-600"
            title="Desen aralığı (pt)"
          />
          <span class="text-xs text-[var(--chrome-text)] w-6 text-right font-mono">{{ store.paperBackground.spacing }}</span>
        </div>

        <label class="flex items-center gap-2 mb-3 cursor-pointer" title="Kenar marjin çizgisi">
          <input
            type="checkbox"
            :checked="store.paperBackground.margin"
            @change="store.setPaperBackground({ margin: ($event.target as HTMLInputElement).checked })"
            class="accent-indigo-600"
          />
          Marjin çizgisi
        </label>

        <div class="mb-1 text-[var(--chrome-muted)]">Sayfa biçimi <span class="text-[var(--chrome-faint)]">(yeni sayfalar)</span></div>
        <select
          :value="store.pageFormat"
          @change="store.setPageFormat(($event.target as HTMLSelectElement).value)"
          class="w-full px-2 py-1 rounded bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border-strong)] text-[var(--chrome-title)]"
        >
          <option v-for="(_, name) in PAGE_FORMATS" :key="name" :value="name">{{ name }}</option>
          <option value="custom">Özel</option>
        </select>

        <div class="flex gap-1 mt-2">
          <button
            @click="store.setPageOrientation('portrait')"
            class="flex-1 px-2 py-1 rounded transition"
            :class="store.pageOrientation === 'portrait' ? 'bg-indigo-600 text-white' : 'bg-[var(--chrome-bg-soft)] hover:bg-[var(--chrome-bg-soft)]'"
          >
            Dikey
          </button>
          <button
            @click="store.setPageOrientation('landscape')"
            class="flex-1 px-2 py-1 rounded transition"
            :class="store.pageOrientation === 'landscape' ? 'bg-indigo-600 text-white' : 'bg-[var(--chrome-bg-soft)] hover:bg-[var(--chrome-bg-soft)]'"
          >
            Yatay
          </button>
        </div>

        <div v-if="store.pageFormat === 'custom'" class="flex items-center gap-2 mt-2">
          <label class="flex-1">
            <span class="text-[var(--chrome-faint)]">Genişlik</span>
            <input
              type="number"
              min="100"
              max="3000"
              :value="store.customW"
              @change="store.setCustomSize(Number(($event.target as HTMLInputElement).value), store.customH)"
              class="w-full px-2 py-1 rounded bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border-strong)] text-[var(--chrome-title)]"
            />
          </label>
          <label class="flex-1">
            <span class="text-[var(--chrome-faint)]">Yükseklik</span>
            <input
              type="number"
              min="100"
              max="3000"
              :value="store.customH"
              @change="store.setCustomSize(store.customW, Number(($event.target as HTMLInputElement).value))"
              class="w-full px-2 py-1 rounded bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border-strong)] text-[var(--chrome-title)]"
            />
          </label>
        </div>

        <div class="mt-3 pt-2 border-t border-[var(--chrome-border)]">
          <div class="mb-1 text-[var(--chrome-muted)]">Kalem basıncı <span class="text-[var(--chrome-faint)]">(0=kapalı)</span></div>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            :value="store.pressureSensitivity"
            @input="store.setPressureSensitivity(Number(($event.target as HTMLInputElement).value))"
            class="w-full accent-indigo-600"
            title="0=kapalı, 2=çok hassas"
          />
          <label class="flex items-center gap-2 mt-2 cursor-pointer" title="Açıkken parmakla çizim engellenir">
            <input
              type="checkbox"
              :checked="store.rejectTouch"
              @change="store.setRejectTouch(($event.target as HTMLInputElement).checked)"
              class="accent-indigo-600"
            />
            Avuç reddi
          </label>
        </div>

        <div class="mt-3 pt-2 border-t border-[var(--chrome-border)]">
          <div class="mb-1 text-[var(--chrome-muted)]">Ayar yedeği</div>
          <div class="flex gap-1">
            <button
              @click="backupSettings"
              class="flex-1 px-2 py-1 rounded bg-[var(--chrome-bg-soft)] hover:bg-[var(--chrome-bg-soft)] transition"
              title="Ayarları JSON indir"
            >
              Yedekle
            </button>
            <label
              class="flex-1 px-2 py-1 rounded bg-[var(--chrome-bg-soft)] hover:bg-[var(--chrome-bg-soft)] transition cursor-pointer text-center"
              title="Yedekten geri yükle"
            >
              Geri yükle
              <input type="file" accept="application/json,.json" class="hidden" @change="onSettingsFile" />
            </label>
          </div>
        </div>
      </div>

      <button
        @click="clearCanvas"
        class="px-3 py-1 rounded text-xs font-medium text-[var(--chrome-text)] hover:text-[var(--chrome-title)] transition flex items-center gap-1"
        title="Aktif sayfayı temizle"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.832A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.832L3 7m12 4h4m4-4v4m-4-6h4m-5.303-5.303L16 16" />
        </svg>
        Temizle
      </button>
    </header>

    <div class="relative flex-1 bg-[var(--page-bg)] min-h-0">
      <!-- Alt katman: commit'lenmiş stroke'lar. Üst katman: aktif çizgi (pointer burada). -->
      <canvas
        ref="baseCanvas"
        class="absolute inset-0 w-full h-full block"
      ></canvas>
      <canvas
        ref="overlayCanvas"
        class="absolute inset-0 w-full h-full touch-none select-none block"
        :style="{ cursor: store.currentTool === 'text' ? 'text' : store.currentTool === 'image' ? 'copy' : store.currentTool === 'select' ? 'default' : 'crosshair' }"
        @pointerdown="startDraw"
        @pointermove="draw"
        @pointerup="endDraw"
        @pointerleave="endDraw"
        @pointercancel="endDraw"
      ></canvas>
      <input
        ref="imgInput"
        type="file"
        accept="image/*,.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg"
        class="hidden"
        @change="onImageFile"
      />

      <div
        v-if="store.currentTool === 'text' && store.activeTextId"
        class="absolute top-3 left-1/2 -translate-x-1/2 z-10 w-80 rounded-lg bg-[var(--chrome-bg)] border border-[var(--chrome-border-strong)] p-3 text-xs text-[var(--chrome-text)] shadow-xl"
        role="dialog"
        aria-label="Metin düzenle"
      >
        <textarea
          ref="textArea"
          rows="3"
          :value="store.activeText()?.text ?? ''"
          @input="onTextInput"
          @keydown.escape="closeTextEditor"
          placeholder="Metni yaz… (boş bırakılırsa silinir)"
          class="w-full px-2 py-1.5 rounded bg-[var(--chrome-bg-soft)] border border-[var(--chrome-border-strong)] text-[var(--chrome-title)] resize-y"
        ></textarea>
        <div class="flex items-center gap-2 mt-2">
          <input
            type="range"
            min="8"
            max="72"
            step="1"
            :value="store.activeText()?.size ?? store.textSize"
            @input="onTextSizeInput(Number(($event.target as HTMLInputElement).value))"
            class="flex-1 accent-indigo-600"
            title="Yazı boyu"
          />
          <input
            type="color"
            :value="store.activeText()?.color ?? store.color"
            @input="onTextColorInput(($event.target as HTMLInputElement).value)"
            class="w-7 h-7 rounded bg-transparent border border-[var(--chrome-border-strong)] cursor-pointer p-0.5"
            title="Yazı rengi"
          />
          <button
            @click="delActiveText"
            class="px-2 py-1 rounded hover:bg-red-600/40 text-[var(--chrome-text)] hover:text-white transition"
            title="Metni sil"
          >
            Sil
          </button>
          <button
            @click="closeTextEditor"
            class="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
            title="Kapat (Esc)"
          >
            Tamam
          </button>
        </div>
      </div>

      <div
        v-if="store.currentTool === 'image' && store.activeImageId"
        class="absolute top-3 left-1/2 -translate-x-1/2 z-10 w-72 rounded-lg bg-[var(--chrome-bg)] border border-[var(--chrome-border-strong)] p-3 text-xs text-[var(--chrome-text)] shadow-xl"
        role="dialog"
        aria-label="Resim"
      >
        <div class="flex items-center justify-between mb-2">
          <span class="font-medium text-[var(--chrome-title)] font-mono">
            Resim {{ store.activeImage()?.w }}×{{ store.activeImage()?.h }}
          </span>
          <span v-if="store.imgBusy" class="text-[10px] text-yellow-400/80 font-mono">işleniyor…</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[var(--chrome-faint)] whitespace-nowrap">Boyut</span>
          <input
            type="range"
            min="32"
            max="1200"
            step="4"
            :value="store.activeImage()?.w ?? 200"
            @input="onImgWidth(Number(($event.target as HTMLInputElement).value))"
            class="flex-1 accent-indigo-600"
            title="Genişlik (oran korunur)"
          />
        </div>
        <div class="flex items-center gap-2 mt-2">
          <button
            @click="delActiveImage"
            class="px-2 py-1 rounded hover:bg-red-600/40 text-[var(--chrome-text)] hover:text-white transition"
            title="Resmi sil"
          >
            Sil
          </button>
          <button
            @click="store.activeImageId = null"
            class="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
            title="Kapat (Esc)"
          >
            Tamam
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
          title="Önceki sayfa"
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
          title="Sonraki sayfa"
        >
          ›
        </button>
        <span class="w-px h-4 bg-[var(--chrome-border)]"></span>
        <button
          @click="addPage"
          class="px-2 py-0.5 rounded hover:bg-[var(--chrome-bg-soft)] font-mono"
          title="Yeni sayfa"
        >
          +
        </button>
        <button
          @click="askDeletePage"
          :disabled="store.pages.length <= 1"
          class="px-2 py-0.5 rounded hover:bg-red-600/40 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Aktif sayfayı sil"
        >
          Sil
        </button>
        <span class="w-px h-4 bg-[var(--chrome-border)]"></span>
        <button
          @click="zoomOut"
          class="px-2 py-0.5 rounded hover:bg-[var(--chrome-bg-soft)] font-mono"
          title="Uzaklaş"
        >
          −
        </button>
        <button
          @click="resetZoom"
          class="font-mono w-12 text-center text-[var(--chrome-title)] hover:bg-[var(--chrome-bg-soft)] rounded py-0.5"
          :title="`Yakınlaştırma: ${store.zoomLabel} (sıfırlamak için tıkla)`"
        >
          {{ store.zoomLabel }}
        </button>
        <button
          @click="zoomIn"
          class="px-2 py-0.5 rounded hover:bg-[var(--chrome-bg-soft)] font-mono"
          title="Yakınlaş"
        >
          +
        </button>
      </div>
      <!-- Perf HUD: reaktivite dışı güncellenir (kendisi render tetiklemez) -->
      <div
        ref="hud"
        class="absolute bottom-2 right-2 text-[10px] leading-tight text-[var(--chrome-faint)] bg-[var(--chrome-bg)] rounded px-1.5 py-0.5 pointer-events-none font-mono"
      ></div>

      <div
        v-if="store.savedSession"
        class="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--chrome-bg)] border border-[var(--chrome-border-strong)] text-xs text-[var(--chrome-title)] select-none"
        role="dialog"
        aria-label="Önceki oturum"
      >
        <span>
          Önceki oturum ({{ store.savedSession.when }}, {{ store.savedSession.pages }} sayfa,
          {{ store.savedSession.strokes }} çizgi)
        </span>
        <button
          @click="restoreSession"
          class="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
        >
          Geri yükle
        </button>
        <button
          @click="store.dismissSavedSession()"
          class="px-2 py-0.5 rounded hover:bg-[var(--chrome-bg-soft)] text-[var(--chrome-text)]"
        >
          Yeni başlat
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { drawingPerf, PAGE_FORMATS, PAPER_THEMES, useDrawingStore } from '@/stores/drawing'
import { selectionBBox } from '@/lib/select'

const baseCanvas = ref<HTMLCanvasElement | null>(null)
const overlayCanvas = ref<HTMLCanvasElement | null>(null)
const hud = ref<HTMLDivElement | null>(null)
const pdfError = ref('')
const showSettings = ref(false)
const showFile = ref(false)
const store = useDrawingStore()

// Hızlı erişim paleti (yanındaki damlalık özel renk için)
const PALETTE = ['#ffffff', '#000000', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7']
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

const cancelSelGesture = () => {
  selActive = false
  selMoving = false
  selLast = null
  selAnchor = null
  selCurrent = null
  selPoly = null
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
  const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e]
  for (const ev of events) {
    const p = store.eventToPage(ev as PointerEvent)
    if (selMoving && selLast) {
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
  const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e]
  for (const ev of events) {
    const p = store.eventToPage(ev as PointerEvent)
    if (!textMoving && textDownHit) {
      const dx = p.x - textDownPos.x
      const dy = p.y - textDownPos.y
      if (dx * dx + dy * dy >= 9) {
        textMoving = true
        textMoveId = textDownHit
        textMoveLast = p
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

const onTextSizeInput = (n: number) => {
  if (!store.activeTextId) return
  store.updateTextStyle(store.activeTextId, { size: n })
}

const onTextColorInput = (hex: string) => {
  if (!store.activeTextId) return
  store.updateTextStyle(store.activeTextId, { color: hex })
}

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
  const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e]
  for (const ev of events) {
    const p = store.eventToPage(ev as PointerEvent)
    if (!imgMoving && imgDownHit) {
      const dx = p.x - imgDownPos.x
      const dy = p.y - imgDownPos.y
      if (dx * dx + dy * dy >= 9) {
        imgMoving = true
        imgMoveId = imgDownHit
        imgMoveLast = p
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

const startDraw = (e: PointerEvent) => {
  if (!overlayCanvas.value) return
  pointers.set(e.pointerId, ptrPos(e))
  if (pointers.size === 2) {
    store.cancelActiveStroke()
    cancelSelGesture()
    cancelTextGesture()
    cancelImageGesture()
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
  if (store.rejectTouch && e.pointerType === 'touch') return
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
  const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e]
  for (const ev of events) store.draw(ev as PointerEvent)
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
  // Araç kısayolları (modsuz): V seç, P kalem, H vurgu, E silgi, L/R/O/A şekiller, T metin, G resim.
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

const exportPng = () => {
  showFile.value = false
  const url = store.exportDataURL()
  if (!url) return
  const a = document.createElement('a')
  a.href = url
  a.download = `calem-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`
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
  a.download = `calem-ayarlar-${new Date().toISOString().slice(0, 10)}.json`
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
  const hasInk = store.pages.some((p) => p.strokes.length > 0)
  if (hasInk && !confirm('Mevcut çizimler PDF sayfalarıyla değişecek. Devam?')) return
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

const askClosePdf = () => {
  showFile.value = false
  const hasInk = store.pages.some((p) => p.strokes.length > 0)
  if (hasInk && !confirm('PDF kapatılıp tek boş sayfaya dönülsün mü?')) return
  store.closePdf()
  updateHud(true)
}

const clearCanvas = () => {
  activePointerId = null
  store.clearCanvas()
  updateHud(true)
}

// Trackpad/mause tekeri: yalın = pan, ctrl/cmd = imleç sabitli zoom.
// passive:false ŞART (sayfa-zoom'u engellemek için preventDefault).
const onWheel = (e: WheelEvent) => {
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

const askDeletePage = () => {
  if (store.pages.length <= 1) return
  if (confirm(`Sayfa ${store.activePageIndex + 1} silinsin mi? (${store.drawingCount} çizgi kaybolur)`)) {
    activePointerId = null
    store.deletePage(store.activePageIndex)
    updateHud(true)
  }
}

const restoreSession = async () => {
  const ok = await store.loadPersisted()
  if (!ok) showPdfError('Oturum yüklenemedi')
  updateHud(true)
}

const sizeCanvas = () => {
  if (!baseCanvas.value || !overlayCanvas.value) return
  store.resizeCanvas()
  drawSelectionOverlay()
}

// Seçim değişince bbox'ı tazele (taşıma nokta-mutasyonu, id aynı — orası explicit redraw).
let stopSelWatch: (() => void) | null = null
let stopTextWatch: (() => void) | null = null

// Canvas initialization
onMounted(() => {
  if (!baseCanvas.value || !overlayCanvas.value) return
  overlayCanvas.value.style.touchAction = 'none'

  store.setCanvasRef(baseCanvas.value)
  store.setOverlayRef(overlayCanvas.value)
  // Önce ayarlar (kâğıt rengi), sonra ilk boya — yanlış renk flaşı yok.
  // Otomatik oturum yükleme YOK: kayıt varsa banner çıkar, seçim kullanıcıda.
  store
    .loadSettings()
    .then(() => {
      store.setupCanvas()
      return store.checkSavedSession()
    })
    .then(() => updateHud(true))
  updateHud(true)

  window.addEventListener('resize', sizeCanvas)
  window.addEventListener('keydown', onKeyDown)
  overlayCanvas.value.addEventListener('wheel', onWheel, { passive: false })
  stopSelWatch = watch(
    () => store.selectedIds,
    () => drawSelectionOverlay(),
  )
  // Editör açılınca fareyi bekletme — klavye hazır gelsin.
  stopTextWatch = watch(
    () => store.activeTextId,
    (id) => {
      if (id) nextTick(() => textArea.value?.focus())
    },
  )
})

onUnmounted(() => {
  if (rafId !== 0) cancelAnimationFrame(rafId)
  activePointerId = null
  cancelSelGesture()
  cancelTextGesture()
  cancelImageGesture()
  pointers.clear()
  gesture = null
  stopSelWatch?.()
  stopSelWatch = null
  stopTextWatch?.()
  stopTextWatch = null
  window.removeEventListener('resize', sizeCanvas)
  window.removeEventListener('keydown', onKeyDown)
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
