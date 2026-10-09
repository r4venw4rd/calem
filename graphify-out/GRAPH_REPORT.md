# Graph Report - calem  (2026-10-09)

## Corpus Check
- 1 files · ~115,211 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 425 nodes · 765 edges · 35 communities (21 shown, 14 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 24 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Engine Config and PDF Libraries
- Package Metadata and Vite
- CanvasView Component State
- IndexedDB Storage and Tools
- Config Files and Paper
- Canvas Actions
- Backend Plan and Cloud Specs
- Selection Geometry and Tests
- Dev Toolchain
- Canvas Lifecycle and Scroll
- PWA Manifest
- Plan and Test Core
- Eraser Geometry and Tests
- Pointer Gesture Entry
- TypeScript Config
- File Import Export
- Menus and Presentation
- App Entry and Vision
- Banner Brand
- OpenCode Plugin Meta
- Touch Icon Brand
- Icon 192 Brand
- Icon 512 Brand
- TSConfig References
- File Format Plan Test
- Layer Plan Test
- Page View Plan Test
- Shape Plan Test
- Text Image Plan Test
- Toolbar Plan Test
- Service Worker
- Dev Toolchain Doc

## God Nodes (most connected - your core abstractions)
1. `updateHud()` - 45 edges
2. `drawSelectionOverlay()` - 22 edges
3. `useDrawingStore` - 18 edges
4. `startDraw()` - 11 edges
5. `draw()` - 11 edges
6. `toggleScroll()` - 11 edges
7. `Calem Backend Plan` - 11 edges
8. `DocStorage` - 10 edges
9. `onKeyDown()` - 9 edges
10. `tx()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `useDrawingStore` --calls--> `pdfFileName()`  [EXTRACTED]
  src/stores/drawing.ts → src/config/files.ts
- `selInside()` --calls--> `selectionBBox()`  [EXTRACTED]
  src/views/CanvasView.vue → src/lib/select.ts
- `useDrawingStore` --calls--> `splitRunsOutside()`  [EXTRACTED]
  src/stores/drawing.ts → src/lib/erase.ts
- `drawSelectionOverlay()` --calls--> `selectionBBox()`  [EXTRACTED]
  src/views/CanvasView.vue → src/lib/select.ts
- `useDrawingStore` --calls--> `coalescedOf()`  [EXTRACTED]
  src/stores/drawing.ts → src/lib/select.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Calem brand lockup** — public_banner_image, public_banner_wordmark, public_banner_icon_motif [EXTRACTED 0.75]
- **Xournal parity phased delivery** — plan_xournal_parity, plan_paper_background, plan_selection_system, plan_shape_tools, plan_text_image_boxes, plan_layer_model [EXTRACTED 0.85]
- **Calem iOS Touch Icon Branding System** — public_apple_touch_icon_file, public_apple_touch_icon_appicon, public_apple_touch_icon_notetaking_concept [INFERRED 0.75]
- **Manual E2E coverage of drawing pipeline** — test_drawing_ink, test_eraser_modes, test_selection_clipboard, test_undo_redo, test_file_operations [INFERRED 0.75]
- **App Icon Branding System** — public_icon_192_appicon, public_icon_192_brand_identity, public_icon_192_pwa_purpose [INFERRED 0.75]
- **Calem PWA Brand Identity System** — public_icon_512_image, public_icon_512_brandidentity, public_icon_512_purpose [INFERRED 0.75]
- **Locked auth providers behind one AuthProvider signature** — backend_auth_provider_seam, backend_email_password_provider, backend_oauth_google_provider [EXTRACTED 1.00]
- **Page LWW plus tombstone delete sync** — backend_sync_engine, backend_page_last_write_wins, backend_page_tombstone_sync [EXTRACTED 1.00]
- **Membership unlocks cloud only with placeholder quotas** — backend_membership, backend_membership_tier_quota, backend_no_local_feature_lock [EXTRACTED 1.00]

## Communities (35 total, 14 thin omitted)

### Community 0 - "Engine Config and PDF Libraries"
Cohesion: 0.06
Nodes (63): B64_CHUNK, DIRTY_PAD_SCREEN, DPR_CAP, EXPORT_SCALE, FALLBACK_VIEWPORT, HISTORY_CAP, IMAGE_MAX_DIM, JPEG_QUALITY (+55 more)

### Community 1 - "Package Metadata and Vite"
Cohesion: 0.05
Nodes (38): dependencies, jspdf, pdfjs-dist, pinia, vue, vue-router, engines, node (+30 more)

### Community 2 - "CanvasView Component State"
Cohesion: 0.05
Nodes (27): activeSlot, baseCanvas, blockEls, customPicker, editingCustom, fileMenu, hud, imgInput (+19 more)

### Community 3 - "IndexedDB Storage and Tools"
Cohesion: 0.08
Nodes (26): DocStorage, idbDeleteFile(), idbGet(), idbGetFile(), idbGetImage(), idbGetKey(), idbSet(), idbSetFile() (+18 more)

### Community 4 - "Config Files and Paper"
Cohesion: 0.13
Nodes (22): jspdf, pdfjs-dist, calemFileName(), DEFAULT_PAPER_BACKGROUND, PAPER_SPACING_MAX, PAPER_SPACING_MIN, SliderKey, SLIDERS (+14 more)

### Community 5 - "Canvas Actions"
Cohesion: 0.10
Nodes (28): activateLayer(), addLayerBtn(), addPage(), addPaletteBtn(), askClosePdf(), askDeleteLayer(), askDeletePage(), askDeletePalette() (+20 more)

### Community 6 - "Backend Plan and Cloud Specs"
Cohesion: 0.12
Nodes (10): Accounts, AuthProvider seam, Authentication, Calem Backend Plan, Cloud Sync, src/config constants package, DocStorage seam with IDB adapter, IndexedDB local source of truth (+2 more)

### Community 7 - "Selection Geometry and Tests"
Cohesion: 0.24
Nodes (14): BBoxStroke, coalescedOf(), normRect, pointInPolygon(), pointInRect(), rectsOverlap(), selectByLasso(), selectByRect() (+6 more)

### Community 8 - "Dev Toolchain"
Cohesion: 0.14
Nodes (14): devDependencies, autoprefixer, npm-run-all2, tailwindcss, @tailwindcss/vite, @tsconfig/node24, @types/node, typescript (+6 more)

### Community 9 - "Canvas Lifecycle and Scroll"
Cohesion: 0.17
Nodes (13): bindCanvases(), cancelImageGesture(), cancelPan(), cancelTextGesture(), endDraw(), imageUp(), onWheel(), panUp() (+5 more)

### Community 10 - "PWA Manifest"
Cohesion: 0.17
Nodes (11): background_color, description, display, display_override, icons, name, orientation, screenshots (+3 more)

### Community 11 - "Plan and Test Core"
Cohesion: 0.18
Nodes (10): Stroke versus standard eraser and line style, IndexedDB docs files autosave persistence, Settings and doc migration chain, PageBackground paper pattern model, Lasso rect selection move system, Drawing ink pen highlighter thickness clipping, Standard versus stroke eraser modes, Regression gate type-check build vitest (+2 more)

### Community 12 - "Eraser Geometry and Tests"
Cohesion: 0.33
Nodes (7): vitest, copyPt(), cutAt(), inside(), segmentCircleTs(), splitRunsOutside(), Point

### Community 13 - "Pointer Gesture Entry"
Cohesion: 0.22
Nodes (10): cancelSelGesture(), imageDown(), panDown(), panMove(), ptrPos(), scheduleRender(), selectDown(), selInside() (+2 more)

### Community 14 - "TypeScript Config"
Cohesion: 0.22
Nodes (8): @vue/tsconfig/tsconfig.dom.json, compilerOptions, noUncheckedIndexedAccess, paths, tsBuildInfoFile, exclude, extends, include

### Community 15 - "File Import Export"
Cohesion: 0.25
Nodes (9): exportCalemDoc(), exportPdfDoc(), onCalemFile(), onImageFile(), onPdfFile(), onSettingsFile(), refreshThumbs(), restoreSession() (+1 more)

### Community 16 - "Menus and Presentation"
Cohesion: 0.25
Nodes (8): closeMenus(), closeTextEditor(), onFullscreenChange(), onKeyDown(), positionSlot(), redo(), sizeCanvas(), togglePresent()

### Community 17 - "App Entry and Vision"
Cohesion: 0.40
Nodes (5): App entry mounting main.ts, PWA shell manifest icons theme, Xournal++ parity goal on web, Calem handwriting plus PDF annotation app, Vue 3 plus Vite stack

### Community 18 - "Banner Brand"
Cohesion: 0.50
Nodes (4): Calem brand identity (dark theme, white wordmark, blue-purple gradient), Note document with stylus pen icon motif, banner.png - Calem brand banner, Calem lowercase wordmark

### Community 20 - "Touch Icon Brand"
Cohesion: 0.67
Nodes (3): Calem App Icon Brand Identity, Apple Touch Icon Image File, Digital Note Taking and Editing Concept

### Community 21 - "Icon 192 Brand"
Cohesion: 0.67
Nodes (3): App Icon 192x192, Note Editing Brand Identity, PWA App Icon Purpose

## Knowledge Gaps
- **37 isolated node(s):** `@vue/tsconfig/tsconfig.dom.json`, `autoprefixer`, `npm-run-all2`, `tailwindcss`, `@tsconfig/node24` (+32 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 178 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vue` connect `Package Metadata and Vite` to `Engine Config and PDF Libraries`, `CanvasView Component State`?**
  _High betweenness centrality (0.099) - this node is a cross-community bridge._
- **What connects `@vue/tsconfig/tsconfig.dom.json`, `autoprefixer`, `npm-run-all2` to the rest of the system?**
  _37 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Engine Config and PDF Libraries` be split into smaller, more focused modules?**
  _Cohesion score 0.0594679186228482 - nodes in this community are weakly interconnected._
- **Why does `devDependencies` connect `Dev Toolchain` to `Package Metadata and Vite`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Should `Package Metadata and Vite` be split into smaller, more focused modules?**
  _Cohesion score 0.050505050505050504 - nodes in this community are weakly interconnected._
- **Should `CanvasView Component State` be split into smaller, more focused modules?**
  _Cohesion score 0.05263157894736842 - nodes in this community are weakly interconnected._
- **Should `IndexedDB Storage and Tools` be split into smaller, more focused modules?**
  _Cohesion score 0.08408408408408409 - nodes in this community are weakly interconnected._