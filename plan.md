# Calem → Xournal++ Parity Plan

> Goal: turn Calem into a Xournal++ that runs in the browser.
> Date: 2026-10-09
> Scope: the drawing engine is preserved (`page-space vector + base/overlay` architecture); Xournal features are layered on top.

## 0. Current State (what we have)

- Tools: `pen / highlighter / eraser`, colour palette + eyedropper, per-tool width (`src/stores/drawing.ts:273-282`).
- Pages: multi-page, `A4/A3/A5/Letter/custom + portrait/landscape` (`PAGE_FORMATS`, `defaultPageSize()`).
- View: contain-fit + `zoom/pan/pinch/ctrl-wheel` (`layoutView`, `zoomBy`, `panBy`, `pinch`).
- PDF: multi-page import (pdf.js bitmap), raster export (PNG → jsPDF), close/restore.
- Persist: IndexedDB `docs+files`, autosave debounce, `v1/v2` migration, settings under a separate key (`src/lib/idb.ts`).
- UI: `CanvasView.vue` toolbar + `File/Settings` menus, HUD, session banner.
- Theme: UI chrome `dark/light` (`index.css` vars) + 3 flat hex paper colours (`PAPER_THEMES: gece/siyah/kagit`).

## 1. Gap Analysis (Xournal++ has it, we don't)

| # | Xournal feature | Calem state | Priority |
|---|-----------------|-------------|----------|
| 1 | Paper types: plain/ruled/graph/dotted/staff, spacing+colour+margin | Only a flat, global `paper: string`. `paperFor()` + `paintPage()` fill it | **P0** |
| 2 | Selection: lasso/rectangle, move/copy/paste/delete/resize | None | P0 |
| 3 | Shapes: line/rect/ellipse/arrow/arc + shape recognition | None | P1 |
| 4 | Text box, insert image, LaTeX | None | P1 |
| 5 | Layers (per-page layers) | A single `Page.strokes[]` | P1 |
| 6 | Eraser modes (stroke/standard/whiteout), dashed lines, opacity, fill | A single eraser (paper-paint / destination-out) | P2 |
| 7 | Continuous vertical scrolling, thumbnail strip, hand (pan) tool, one-finger scroll | Single page contain-fit + `1/N` pager | P2 |
| 8 | Vector `.xopp` save + vector PDF export (selectable text) | Raster PNG→PDF, IDB blob | P2 |
| 9 | Customisable toolbar, shortcuts, stylus-only, presentation mode | Fixed toolbar, 2 shortcuts | P3 |

## 2. Phases

### PHASE 1 — Paper Theme (P0, ~first job)
**Goal:** flat colour → a real notebook page.

1.1. Data model (`src/stores/drawing.ts`, `src/lib/idb.ts`):
- [ ] Add a `PageBackground { type: 'blank'|'ruled'|'graph'|'dotted'|'staff', spacing: number, lineColor: string, margin: boolean, marginColor?: string }` type.
- [ ] Add `Page.background?: PageBackground` (global fallback when absent).
- [ ] Global setting: `paperColor + background (type/spacing/lineColor/margin)` → `AppSettings v1 → v2` migration (`loadSettings`, `importSettingsJSON`, `exportSettingsJSON`).
- [ ] Persist `PersistedDoc v2 → v3` migration: keep the old `size`, assign `background` default `blank` (`pageSizeOf`, `cleanStrokes`, `loadPersisted`, `checkSavedSession`).

1.2. Render (`paintPage`, `exportPageToCanvas`):
- [ ] `paintPaperPattern(ctx, page)` helper: `fillRect(paperColor)` + per-type drawing, **in page space** (independent of zoom/DPR, vectors don't shift).
  - `ruled`: horizontal lines every `spacing` pt.
  - `graph`: horizontal + vertical grid (thin, optionally every 5th thick).
  - `dotted`: dot grid (`arc` fill, `spacing`).
  - `staff`: groups of 5 staves.
  - `margin`: vertical red line (e.g. x=72pt).
- [ ] `paintPage()` order: `paper fill → pattern → PDF bitmap (pattern is not drawn when present) → strokes`.
- [ ] No pattern on PDF pages (the existing `paperFor() → null` rule is preserved).
- [ ] Export uses the same path (`exportPageToCanvas` already calls `paintPage` — no extra work, just testing).

1.3. UI (`src/views/CanvasView.vue` settings panel ~L196):
- [ ] `Paper theme` section: colour dots + type select (`Blank/Ruled/Graph/Dotted/Staff`) + `spacing slider (12–48pt)` + `line colour input[type=color]` + `margin checkbox`.
- [ ] `store.setPaperBackground(partial)` action: validate + `persistSettings()` + `repaintBase()`.
- [ ] Per-page vs global decision: **global in v1** (simpler), per-page override in Phase 5 (together with layers).

1.4. Acceptance:
- [ ] Type/colour/spacing changes show up on the canvas and in PNG/PDF export immediately.
- [ ] The setting survives a reload (IDB).
- [ ] Pattern stroke width stays in constant pt while zooming (it doesn't inflate to screen px).
- [ ] No pattern is drawn on PDF pages.

### PHASE 2 — Selection / Move (P0, the biggest functional gap)
- [ ] Add `Tool: 'select-lasso' | 'select-rect'`, add `id` to `Stroke`.
- [ ] Hit-test: rect intersection + lasso point-in-polygon (in page space).
- [ ] Selection state: `selectedIds: Set<string>`, dashed bounding box + handles on the overlay.
- [ ] Ops: move (pointer drag), delete, cut/copy/paste (within a page + across pages), `Ctrl+A/C/X/V/Delete`, nudge (arrow keys).
- [ ] Undo/redo covers selection ops (the current `redoStack: Stroke[]` becomes an op-based stack or a snapshot).
- Acceptance: selection <50ms with 1000 strokes, save/load consistent after a move.

### PHASE 3 — Shape Tools (P1)
- [ ] `line / rect / ellipse / arrow` tools, ratio lock with `Shift`.
- [ ] Preview on the overlay, commit to base (the existing `renderActiveStroke` pattern).
- [ ] `Stroke.style?: { dash?: number[], fill?: string, arrowHead?: boolean }`, dash/fill support in `paintStroke()`.
- [ ] (Optional) shape recognition: snap freehand strokes to the nearest primitive.
- Acceptance: shapes stay vector-crisp on export (clean edges despite the raster).

### PHASE 4 — Text / Image (P1)
- [ ] `TextBox { id, x, y, text, font, size, color }` per page, edited via an HTML overlay above the canvas, rendered to the canvas with `fillText`.
- [ ] `ImageBox { id, x, y, w, h, blobId }`: insert (file picker + drag-drop + paste), resize with handles, store in the IDB `files` store (the PDF bytes pattern).
- [ ] LaTeX: out of scope in v1 — deferred to the text box as a MathJax render (P3).
- Acceptance: moving/deleting text and images works with selection and is included in export.

### PHASE 5 — Layers (P1)
- [ ] `Page.layers: Layer[]`, `Layer { id, name, visible, locked, strokes[] }`, migrate the existing `strokes` → `layers[0]` (`v3 → v4`).
- [ ] UI: layers panel (eye/lock, move up/down, merge).
- [ ] `repaintBase`, `recountActive`, `cleanStrokes`, selection — all target the active layer.
- Acceptance: old records open with a single layer, no data loss.

### PHASE 6 — Eraser Modes + Stroke Style (P2)
- [ ] Eraser: `stroke-eraser` (removes the touched stroke entirely) vs `standard` (current).
- [ ] Style: opacity slider, dashed (`solid/dash/dot`), highlighter alpha blending fix.
- [ ] Stabiliser (simple moving average) optional.
- Acceptance: stroke-eraser comes back with undo.

### PHASE 7 — Page UX / View (P2)
- [ ] Hand (pan) tool + `Space+drag`, one-finger scroll vs two-finger pinch separation, stylus-only toggle (the current `rejectTouch` grows).
- [ ] Continuous vertical view (current contain-fit single page → scroll container, per-page `layoutView`).
- [ ] Thumbnail sidebar (cached `exportPageToCanvas(0.2x)`).
- [ ] Page ops: copy/duplicate, move to start/end, add from template.
- Acceptance: scrolling is smooth in a 20-page PDF, active page tracking is correct.

### PHASE 8 — File Format (P2)
- [ ] `.calem` (JSON+assets zip) save/open: vector strokes + text + image refs + background.
- [ ] Vector PDF export: write ink with jsPDF `lines()`, embed the background bitmap underneath (keep the raster fallback, with an adjustable `raster/vector` option).
- Acceptance: text is selectable in the vector PDF, file size <1/3 of raster.

### PHASE 9 — Toolbar / Polish (P3)
- [x] Shortcuts: `V/P/H/E/L/R/O/A/T/G`, `Space`, `F`, `Ctrl+Z/Y/A/C/X/V`, `Del/Esc/arrows` (+ reference in the settings panel).
- [x] Fullscreen/presentation mode (minimal chrome, exit with Esc).
- [ ] Customisable toolbar (drag-to-reorder) — deferred.
- NO plugin hook (dropped from scope).

## 3. Migration Chain (as realised)

```
settings: v1 → v2 (+background) → v3 (+eraserMode)
doc:      v2 → v3 (+texts) → v4 (+images) → v5 (+layers)
```

Rules:
- Don't drop unknown fields; keep the `cleanStrokes`/`pageSizeOf` pattern.
- On every migration an old record opens as one page / one layer / blank paper; ink is never lost.
- `checkSavedSession` recognises the new versions.

## 4. Test Strategy (in every phase)

- New pure helpers (`patternSpacing`, `hitTest`, `dashStyle`) are written unit-testable, like the existing pure rules (`needsPdfRerender`).
- Manual checklist: draw → reload → export (PNG+PDF) → undo/redo → switch page.
- Perf HUD (`emaMs/frameMs`) regression: check with 1000+ strokes in Phases 2/7.

## 5. Recommended Order (to avoid dead ends)

1. **Phase 1 (paper)** — 1-2 days, self-contained, big visual payoff. ← start here
2. Phase 2 (selection) — the hardest, but it's what makes it feel like Xournal.
3. Phase 3+4 (shapes + text/images) — they build on selection.
4. Phase 5 (layers) — breaks the data model, don't do it early.
5. Phases 6-9 — polish, in order.

## 6. Phase 1 File Touch List

- `src/stores/drawing.ts`: `PAPER_THEMES` → `PaperColor + PaperBackground`, `Page`, `AppSettings`, `paintPage`, `setPaperBackground`, persist/migration.
- `src/views/CanvasView.vue`: settings panel (L196-207 grows), pattern UI next to `PALETTE`.
- `src/lib/idb.ts`: `SETTINGS_KEY` versioning, `PersistedDocV3` type.
- New: `src/lib/paper.ts` (pure pattern math — testable).

---
*Note: the `paperFor()` PDF-transparent rule and the page-space invariant (a point is never scaled by a resize) hold in every phase.*
