# Graph Report - calem  (2026-10-10)

## Corpus Check
- 54 files · ~129,720 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 2, .ico 1, .css 1)

## Summary
- 583 nodes · 1078 edges · 54 communities (35 shown, 19 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Membership Tiers and Quotas
- CanvasView Component State
- IndexedDB DocStorage Layer
- Canvas Actions and Editing
- Text Input Panel
- Drawing Store and Palettes
- Paper Background and Export
- Render Engine Constants
- File Dialogs and Export
- Backend Cloud Plan
- Offline Sync Engine
- Pointer Gestures and Drawing
- Package Metadata
- Dev Toolchain
- App Entry and Launch
- PWA Manifest
- Page Formats and Sliders
- Selection Geometry and Tests
- File Naming and Import
- Localization Strings
- TypeScript Config
- Page Layout and Scroll
- NPM Scripts
- Drawing Tools Config
- Runtime Dependencies
- Vite Build Config
- Persistence Architecture Notes
- Brand Banner Identity
- Layer Palette Rename
- Project Docs Hub
- Touch Icon Branding
- PWA Icon 192
- PWA Icon 512
- Page Activation and Scroll
- Dialog Controls
- Focus Trapping
- TSConfig References
- Planned Cloud Sync
- Node Engine Version
- Service Worker Shell
- Launch Handle Drain
- HTML Entry Point
- Eraser Modes
- Export Formats
- Layer Model Migration
- Scroll Thumbnails View
- Selection Move System
- Shape Tools
- Text Image Boxes
- Toolbar Shortcuts
- Xournal Parity Goal

## God Nodes (most connected - your core abstractions)
1. `updateHud()` - 49 edges
2. `drawSelectionOverlay()` - 22 edges
3. `useDrawingStore` - 21 edges
4. `t()` - 13 edges
5. `onKeyDown()` - 13 edges
6. `TextInputManager` - 12 edges
7. `vitest` - 11 edges
8. `DocStorage` - 11 edges
9. `askConfirm()` - 11 edges
10. `startDraw()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Cloud Sync (planned seam)` --semantically_similar_to--> `Optional cloud sync planned`  [INFERRED] [semantically similar]
  BACKEND.md → README.md
- `useDrawingStore` --calls--> `pdfFileName()`  [EXTRACTED]
  src/stores/drawing.ts → src/config/files.ts
- `useDrawingStore` --calls--> `calemFileName()`  [EXTRACTED]
  src/stores/drawing.ts → src/config/files.ts
- `useDrawingStore` --calls--> `isLocale()`  [EXTRACTED]
  src/stores/drawing.ts → src/config/locale.ts
- `CalemUser` --references--> `MembershipTier`  [EXTRACTED]
  src/lib/auth.ts → src/config/membership.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Xournal parity phased delivery** — plan_xournal_parity, plan_paper_background, plan_selection_system, plan_shape_tools, plan_text_image_boxes, plan_layer_model [EXTRACTED 0.85]
- **Calem iOS Touch Icon Branding System** — public_apple_touch_icon_file, public_apple_touch_icon_appicon, public_apple_touch_icon_notetaking_concept [INFERRED 0.75]
- **Calem brand lockup** — public_banner_image, public_banner_wordmark, public_banner_icon_motif [EXTRACTED 0.75]
- **App Icon Branding System** — public_icon_192_appicon, public_icon_192_brand_identity, public_icon_192_pwa_purpose [INFERRED 0.75]
- **Calem PWA Brand Identity System** — public_icon_512_image, public_icon_512_brandidentity, public_icon_512_purpose [INFERRED 0.75]
- **Offline-first local-ready flow** — backend_indexeddb_store, backend_docstorage, backend_sync_engine, backend_calem_export [EXTRACTED 0.85]

## Communities (54 total, 19 thin omitted)

### Community 0 - "Membership Tiers and Quotas"
Cohesion: 0.05
Nodes (37): vitest, applyDiscount(), canAddPage(), canUseCloud(), DEFAULT_TIER, FOUNDER_DISCOUNT_PCT, isTier(), MEMBERSHIP_TIERS (+29 more)

### Community 1 - "CanvasView Component State"
Cohesion: 0.03
Nodes (47): activeSlot, appHeightPx, baseCanvas, blockEls, calemInput, customPicker, dialogInput, dialogKind (+39 more)

### Community 2 - "IndexedDB DocStorage Layer"
Cohesion: 0.08
Nodes (30): ANONYMOUS_OWNER, docOwner(), DocStorage, idbDeleteFile(), idbGet(), idbGetFile(), idbGetImage(), idbGetKey() (+22 more)

### Community 3 - "Canvas Actions and Editing"
Cohesion: 0.10
Nodes (34): activateLayer(), addLayerBtn(), addPage(), cancelImageGesture(), closeMenus(), closeTextEditor(), delActiveImage(), delActiveText() (+26 more)

### Community 4 - "Text Input Panel"
Cohesion: 0.10
Nodes (16): vue, currentText, emit, Emits, fontSize, handleCancel(), handleDone(), panelStyle (+8 more)

### Community 5 - "Drawing Store and Palettes"
Cohesion: 0.10
Nodes (21): CUSTOM_SLOT_COUNT, DEFAULT_PALETTES, PALETTE_MAX_COLORS, PALETTE_MAX_COUNT, bgCanvases, CalemFile, ColorPalette, DashStyle (+13 more)

### Community 6 - "Paper Background and Export"
Cohesion: 0.16
Nodes (19): jspdf, pdfjs-dist, DEFAULT_PAPER_BACKGROUND, PAPER_SPACING_MAX, PAPER_SPACING_MIN, clampSpacing(), cleanHex(), cleanPaperBackground() (+11 more)

### Community 7 - "Render Engine Constants"
Cohesion: 0.19
Nodes (19): B64_CHUNK, DIRTY_PAD_SCREEN, DPR_CAP, EXPORT_SCALE, FALLBACK_VIEWPORT, HISTORY_CAP, IMAGE_MAX_DIM, JPEG_QUALITY (+11 more)

### Community 8 - "File Dialogs and Export"
Cohesion: 0.18
Nodes (21): tr, askClearCanvas(), askClosePdf(), askConfirm(), askDeleteLayer(), askDeletePage(), askDeletePalette(), clearCanvas() (+13 more)

### Community 9 - "Backend Cloud Plan"
Cohesion: 0.15
Nodes (18): AuthProvider interface, BillingProvider seam, .calem export backup, DocStorage user-scoped storage seam, Founder discount and CalemUser founder flag, IndexedDB local source (docs and files stores), LocalAuthProvider anonymous user, Membership quota gates canAddPage and storageQuotaBytes (+10 more)

### Community 10 - "Offline Sync Engine"
Cohesion: 0.21
Nodes (16): ackOps(), applyTombstones(), contentKey(), enqueueOp(), isPageOp(), isRemoteNewer(), mergeDocuments(), mergePages() (+8 more)

### Community 11 - "Pointer Gestures and Drawing"
Cohesion: 0.17
Nodes (17): coalescedOf(), cancelTextGesture(), draw(), drawTextBoxOverlay(), imageDown(), imageMove(), panDown(), panMove() (+9 more)

### Community 12 - "Package Metadata"
Cohesion: 0.13
Nodes (14): license, name, private, type, version, autoprefixer, npm-run-all2, tailwindcss (+6 more)

### Community 13 - "Dev Toolchain"
Cohesion: 0.14
Nodes (14): devDependencies, autoprefixer, npm-run-all2, tailwindcss, @tailwindcss/vite, @tsconfig/node24, @types/node, typescript (+6 more)

### Community 14 - "App Entry and Launch"
Cohesion: 0.16
Nodes (9): pinia, vue-router, SERVICE_WORKER_PATH, LaunchHandle, listeners, onLaunchHandle(), pushLaunchHandle(), app (+1 more)

### Community 15 - "PWA Manifest"
Cohesion: 0.15
Nodes (12): background_color, description, display, display_override, file_handlers, icons, lang, name (+4 more)

### Community 16 - "Page Formats and Sliders"
Cohesion: 0.18
Nodes (11): Locale, A4, PAGE_FORMATS, PageFormat, PageOrientation, PAPER_THEMES, PaperTheme, SliderKey (+3 more)

### Community 17 - "Selection Geometry and Tests"
Cohesion: 0.36
Nodes (9): BBoxStroke, normRect, pointInPolygon(), pointInRect(), rectsOverlap(), selectByLasso(), selectByRect(), selectionBBox() (+1 more)

### Community 18 - "File Naming and Import"
Cohesion: 0.18
Nodes (10): CALEM_ACCEPT, calemFileName(), IMAGE_ACCEPT, PDF_ACCEPT, pdfFileName(), pngFileName(), SETTINGS_ACCEPT, settingsBackupName() (+2 more)

### Community 19 - "Localization Strings"
Cohesion: 0.20
Nodes (9): DEFAULT_LOCALE, EN, isLocale(), LOCALES, TOOL_LABELS, toolLabel, UI_STRINGS, UIDict (+1 more)

### Community 20 - "TypeScript Config"
Cohesion: 0.22
Nodes (8): @vue/tsconfig/tsconfig.dom.json, compilerOptions, noUncheckedIndexedAccess, paths, tsBuildInfoFile, exclude, extends, include

### Community 21 - "Page Layout and Scroll"
Cohesion: 0.25
Nodes (9): bindCanvases(), cancelPan(), cancelSelGesture(), onPageLayoutChange(), onWheel(), positionSlot(), refreshBlocks(), scrollActiveIntoView() (+1 more)

### Community 22 - "NPM Scripts"
Cohesion: 0.25
Nodes (8): scripts, build, build-only, dev, dev:fast, preview, test, type-check

### Community 23 - "Drawing Tools Config"
Cohesion: 0.25
Nodes (7): ALL_TOOLS, DEFAULT_WIDTHS, TOOL_META, ToolIcon, ToolMeta, WIDTH_MAX, WIDTH_MIN

### Community 24 - "Runtime Dependencies"
Cohesion: 0.29
Nodes (7): dependencies, jspdf, pdfjs-dist, pinia, ui-audit, vue, vue-router

### Community 25 - "Vite Build Config"
Cohesion: 0.33
Nodes (4): @tailwindcss/vite, vite, vite-plugin-vue-devtools, @vitejs/plugin-vue

### Community 26 - "Persistence Architecture Notes"
Cohesion: 0.50
Nodes (3): IndexedDB docs files autosave persistence, Settings and doc migration chain, PageBackground paper pattern model

### Community 27 - "Brand Banner Identity"
Cohesion: 0.50
Nodes (4): Calem brand identity (dark theme, white wordmark, blue-purple gradient), Note document with stylus pen icon motif, banner.png - Calem brand banner, Calem lowercase wordmark

### Community 28 - "Layer Palette Rename"
Cohesion: 0.50
Nodes (4): addPaletteBtn(), askPrompt(), renameLayer(), renamePaletteBtn()

### Community 29 - "Project Docs Hub"
Cohesion: 0.67
Nodes (3): BACKEND.md backend plan, README.md project overview, TEST.md test schema

### Community 30 - "Touch Icon Branding"
Cohesion: 0.67
Nodes (3): Calem App Icon Brand Identity, Apple Touch Icon Image File, Digital Note Taking and Editing Concept

### Community 31 - "PWA Icon 192"
Cohesion: 0.67
Nodes (3): App Icon 192x192, Note Editing Brand Identity, PWA App Icon Purpose

### Community 33 - "Page Activation and Scroll"
Cohesion: 0.67
Nodes (3): activatePageInPlace(), onBlockUp(), onScrollBox()

### Community 34 - "Dialog Controls"
Cohesion: 0.67
Nodes (3): closeDialog(), dialogCancel(), dialogOk()

### Community 35 - "Focus Trapping"
Cohesion: 0.67
Nodes (3): trapDialogFocus(), trapFocus(), trapIn()

## Knowledge Gaps
- **38 isolated node(s):** `ui-audit`, `@tsconfig/node24`, `@types/node`, `@vue/tsconfig`, `autoprefixer` (+33 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 228 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `Membership Tiers and Quotas` to `IndexedDB DocStorage Layer`, `Paper Background and Export`, `Render Engine Constants`, `Offline Sync Engine`, `Package Metadata`, `Selection Geometry and Tests`?**
  _High betweenness centrality (0.206) - this node is a cross-community bridge._
- **What connects `ui-audit`, `@tsconfig/node24`, `@types/node` to the rest of the system?**
  _38 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Membership Tiers and Quotas` be split into smaller, more focused modules?**
  _Cohesion score 0.05096153846153846 - nodes in this community are weakly interconnected._
- **Why does `vue` connect `Text Input Panel` to `CanvasView Component State`, `Package Metadata`, `Drawing Store and Palettes`, `App Entry and Launch`?**
  _High betweenness centrality (0.153) - this node is a cross-community bridge._
- **Should `CanvasView Component State` be split into smaller, more focused modules?**
  _Cohesion score 0.03278688524590164 - nodes in this community are weakly interconnected._
- **Why does `devDependencies` connect `Dev Toolchain` to `Package Metadata`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Should `IndexedDB DocStorage Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.08305647840531562 - nodes in this community are weakly interconnected._